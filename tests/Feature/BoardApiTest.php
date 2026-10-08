<?php

namespace Tests\Feature;

use App\Models\Board;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoardApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    private function layout(array $overrides = []): array
    {
        return $overrides + [
            'columns' => 24,
            'rows' => 4,
            'pageSeconds' => 8,
            'cell' => ['type' => 'dotmatrix', 'width' => 32, 'height' => 50, 'color' => '#ffb000'],
            'sound' => ['enabled' => false, 'volume' => 0.5],
            'statics' => [['id' => 'logo', 'area' => '0,0 to 3,3', 'image' => '/sample-logo.svg']],
            'fields' => [['id' => 'title', 'area' => '4,0 to 23,0', 'text' => 'DEPARTURES']],
            'lists' => [['id' => 'deps', 'area' => '4,1 to 23,3', 'columns' => [['text' => '{destination}']]]],
        ];
    }

    public function test_saves_a_board_and_gives_back_the_whole_layout_unchanged(): void
    {
        $saved = $this->postJson('/api/boards', ['name' => 'Concourse', 'layout' => $this->layout()])
            ->assertOk()
            ->assertJsonPath('message', 'Board saved.')
            ->json('data');

        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $saved['uuid']);
        $this->getJson("/api/boards/{$saved['id']}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Concourse')
            ->assertJsonPath('data.layout', $this->layout());
    }

    public function test_keeps_spaces_and_empty_text_in_a_layout_exactly(): void
    {
        // The blank flap leads the stack; trimmed off, empty cells showed "A" on screens.
        $layout = $this->layout([
            'cell' => ['type' => 'splitflap', 'width' => 32, 'height' => 50, 'stack' => ' ABC'],
            'fields' => [['id' => 'platform', 'area' => '4,0 to 23,0', 'text' => ' PLATFORM {platform} ']],
            'lists' => [['id' => 'deps', 'area' => '4,1 to 23,3', 'columns' => [['title' => '', 'text' => '{destination}']]]],
        ]);

        $id = $this->postJson('/api/boards', ['name' => 'Concourse', 'layout' => $layout])->assertOk()->json('data.id');

        $saved = Board::findOrFail($id)->layout;
        $this->assertSame(' ABC', $saved['cell']['stack']);
        $this->assertSame(' PLATFORM {platform} ', $saved['fields'][0]['text']);
        $this->assertSame('', $saved['lists'][0]['columns'][0]['title']);

        $this->putJson("/api/boards/{$id}", ['name' => 'Concourse', 'layout' => $layout])->assertOk();
        $this->assertSame(' ABC', Board::findOrFail($id)->layout['cell']['stack']);
    }

    public function test_lists_boards_by_name_without_their_layouts(): void
    {
        Board::create(['name' => 'Platform 2', 'layout' => $this->layout()]);
        Board::create(['name' => 'Concourse', 'layout' => $this->layout()]);

        $this->getJson('/api/boards')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Concourse')
            ->assertJsonPath('data.1.name', 'Platform 2')
            ->assertJsonMissingPath('data.0.layout');
    }

    public function test_updating_keeps_the_screen_address(): void
    {
        $board = Board::create(['name' => 'Concourse', 'layout' => $this->layout()]);

        $this->putJson("/api/boards/{$board->id}", ['name' => 'Main concourse', 'layout' => $this->layout(['rows' => 6])])
            ->assertOk()
            ->assertJsonPath('data.uuid', $board->uuid)
            ->assertJsonPath('data.layout.rows', 6);
    }

    public function test_refuses_a_board_without_a_name_or_the_basic_shape(): void
    {
        $this->postJson('/api/boards', ['name' => '', 'layout' => $this->layout()])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Give the board a name.');
        $this->postJson('/api/boards', ['name' => 'X', 'layout' => $this->layout(['columns' => 0])])->assertStatus(422);
        $this->postJson('/api/boards', ['name' => 'X', 'layout' => $this->layout(['cell' => ['type' => 'nixie', 'width' => 1, 'height' => 1]])])
            ->assertStatus(422);
        $this->assertSame(0, Board::count());
    }

    public function test_refuses_a_layout_that_is_too_large(): void
    {
        $huge = $this->layout(['statics' => [['id' => 'logo', 'area' => '0,0', 'image' => 'data:image/png;base64,' . str_repeat('A', 2_100_000)]]]);

        $this->postJson('/api/boards', ['name' => 'X', 'layout' => $huge])
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'too large'));
    }

    public function test_deleting_a_board(): void
    {
        $board = Board::create(['name' => 'Concourse', 'layout' => $this->layout()]);

        $this->deleteJson("/api/boards/{$board->id}")->assertOk();
        $this->getJson("/api/boards/{$board->id}")->assertNotFound();
    }

    public function test_boards_need_a_signed_in_user(): void
    {
        $board = Board::create(['name' => 'Concourse', 'layout' => $this->layout()]);
        auth()->forgetGuards();

        $this->getJson('/api/boards')->assertUnauthorized();
        $this->getJson("/api/boards/{$board->id}")->assertUnauthorized();
        $this->putJson("/api/boards/{$board->id}", ['name' => 'X', 'layout' => $this->layout()])->assertUnauthorized();
        $this->assertSame('Concourse', $board->fresh()->name);
    }
}
