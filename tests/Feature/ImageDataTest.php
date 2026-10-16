<?php

namespace Tests\Feature;

use App\Data\BinaryValues;
use App\Data\TargetDatabase;
use App\Data\TargetDatabases;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Support\SqliteTargetDatabase;
use Tests\TestCase;

/** Images kept in binary columns reach a board as data: URLs; other binary values as nothing. */
class ImageDataTest extends TestCase
{
    use RefreshDatabase;

    /** A one-pixel PNG. */
    private const PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82";

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());

        $target = SqliteTargetDatabase::create();
        Schema::connection(SqliteTargetDatabase::NAME)->create('operators', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->binary('logo')->nullable();
        });
        $target->connection()->table('operators')->insert([
            ['name' => 'AVANTI', 'logo' => self::PNG],
            ['name' => 'NORTHERN', 'logo' => "\x00\x01\x02\xfe\xff not an image"],
            ['name' => 'TOO BIG', 'logo' => "\xff\xd8\xff" . str_repeat("\x00", BinaryValues::MAX_IMAGE_BYTES)],
            ['name' => 'NONE', 'logo' => null],
        ]);

        $this->app->instance(TargetDatabases::class, new class($target) extends TargetDatabases {
            public function __construct(private TargetDatabase $target)
            {
            }

            public function current(): ?TargetDatabase
            {
                return $this->target;
            }
        });
    }

    private function logos(array $definition): array
    {
        return array_column($this->postJson('/api/data-sources/preview', $definition + ['name' => 'Operators', 'limit' => 10, 'cacheSeconds' => 30])
            ->assertOk()
            ->json('data'), 'logo', 'name');
    }

    public function test_an_image_becomes_a_data_url_and_other_binary_values_nothing(): void
    {
        $expected = [
            'AVANTI' => 'data:image/png;base64,' . base64_encode(self::PNG),
            'NORTHERN' => null,
            'TOO BIG' => null,
            'NONE' => null,
        ];

        $this->assertSame($expected, $this->logos(['kind' => 'table', 'table' => 'operators', 'columns' => ['name', 'logo'], 'filters' => [], 'sort' => []]));
        $this->assertSame($expected, $this->logos(['kind' => 'sql', 'sql' => 'SELECT name, logo FROM operators']));
    }

    public function test_recognises_images_by_their_first_bytes(): void
    {
        $this->assertSame('image/png', BinaryValues::imageType(self::PNG));
        $this->assertSame('image/jpeg', BinaryValues::imageType("\xff\xd8\xff\xe0rest"));
        $this->assertSame('image/gif', BinaryValues::imageType('GIF89a...'));
        $this->assertSame('image/webp', BinaryValues::imageType("RIFF\x10\x00\x00\x00WEBPVP8 "));
        $this->assertNull(BinaryValues::imageType('<svg xmlns="http://www.w3.org/2000/svg"/>'));
        $this->assertSame('plain text', BinaryValues::value('plain text'));
        $this->assertSame(42, BinaryValues::value(42));
    }

    public function test_reads_a_stream_as_postgresql_gives_bytea(): void
    {
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, self::PNG);
        rewind($stream);

        $this->assertSame('data:image/png;base64,' . base64_encode(self::PNG), BinaryValues::value($stream));
    }
}
