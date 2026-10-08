<?php

namespace Tests\Feature;

use App\Models\Board;
use App\Models\BoardImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImageTest extends TestCase
{
    use RefreshDatabase;

    /** A real 1×1 PNG and GIF, since this PHP has no image library to make fakes with. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    private const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    private const SVG = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(BoardImage::DISK);
        $this->actingAs(User::factory()->create());
    }

    private function upload(string $name, string $content)
    {
        return $this->post('/api/images', ['image' => UploadedFile::fake()->createWithContent($name, $content)], ['Accept' => 'application/json']);
    }

    public function test_uploads_an_image_and_serves_it_to_anyone(): void
    {
        $saved = $this->upload('logo.png', base64_decode(self::PNG))->assertOk()->json('data');

        $this->assertSame('logo.png', $saved['name']);
        $this->assertSame('image/png', $saved['mime']);
        $this->assertSame('/images/' . $saved['uuid'], $saved['url']);
        Storage::disk(BoardImage::DISK)->assertExists(BoardImage::firstOrFail()->path);

        auth()->forgetGuards();
        $response = $this->get($saved['url'])->assertOk();
        $this->assertSame('image/png', $response->headers->get('Content-Type'));
        $this->assertSame(base64_decode(self::PNG), $response->streamedContent());
    }

    public function test_an_svg_is_accepted_and_served_so_nothing_in_it_can_run(): void
    {
        $saved = $this->upload('logo.svg', self::SVG)->assertOk()->json('data');
        $this->assertSame('image/svg+xml', $saved['mime']);

        $response = $this->get($saved['url'])->assertOk();
        $this->assertSame('image/svg+xml', $response->headers->get('Content-Type'));
        $policy = $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("default-src 'none'", $policy);
        $this->assertStringContainsString('sandbox', $policy);
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    public function test_the_type_comes_from_the_content_not_the_name(): void
    {
        $this->upload('logo.png', 'just some text pretending to be an image')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Upload a PNG, JPEG, WebP, GIF or SVG image.');

        $this->assertSame('image/gif', $this->upload('logo.png', base64_decode(self::GIF))->assertOk()->json('data.mime'));
        $this->assertSame(1, BoardImage::count());
    }

    public function test_refuses_an_image_over_2_mb(): void
    {
        $this->upload('huge.png', base64_decode(self::PNG) . str_repeat("\0", 2_100_000))
            ->assertStatus(422)
            ->assertJsonPath('errors.image.0', 'Images can be up to 2 MB. Make this one smaller and try again.');
    }

    public function test_lists_images_with_the_boards_that_show_them(): void
    {
        $url = $this->upload('logo.png', base64_decode(self::PNG))->json('data.url');
        Board::create(['name' => 'Concourse', 'layout' => ['columns' => 4, 'rows' => 1, 'statics' => [['id' => 'logo', 'area' => '0,0', 'image' => $url]], 'cell' => ['type' => 'splitflap', 'width' => 30, 'height' => 40]]]);

        $this->getJson('/api/images')->assertOk()->assertJsonPath('data.0.boards', ['Concourse']);
    }

    public function test_removing_an_image_a_board_shows_asks_first(): void
    {
        $saved = $this->upload('logo.png', base64_decode(self::PNG))->json('data');
        Board::create(['name' => 'Concourse', 'layout' => ['columns' => 4, 'rows' => 1, 'statics' => [['id' => 'logo', 'area' => '0,0', 'image' => $saved['url']]], 'cell' => ['type' => 'splitflap', 'width' => 30, 'height' => 40]]]);
        $path = BoardImage::firstOrFail()->path;

        $this->deleteJson("/api/images/{$saved['id']}")
            ->assertStatus(409)
            ->assertJsonPath('message', 'This image is shown on "Concourse". Remove it anyway?');
        Storage::disk(BoardImage::DISK)->assertExists($path);

        $this->deleteJson("/api/images/{$saved['id']}?force=1")->assertOk();
        Storage::disk(BoardImage::DISK)->assertMissing($path);
        $this->get($saved['url'])->assertNotFound();
    }

    public function test_uploading_and_removing_need_a_signed_in_user(): void
    {
        auth()->forgetGuards();

        $this->upload('logo.png', base64_decode(self::PNG))->assertUnauthorized();
        $this->getJson('/api/images')->assertUnauthorized();
        $this->assertSame(0, BoardImage::count());
    }
}
