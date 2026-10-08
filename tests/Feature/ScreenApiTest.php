<?php

namespace Tests\Feature;

use App\Models\Board;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScreenApiTest extends TestCase
{
    use RefreshDatabase;

    private function board(): Board
    {
        return Board::create(['name' => 'Concourse', 'layout' => [
            'columns' => 24,
            'rows' => 4,
            'dataSource' => '0b6f0d0e-0000-4000-8000-000000000000',
            'cell' => ['type' => 'splitflap', 'width' => 32, 'height' => 50],
        ]]);
    }

    public function test_any_screen_can_fetch_a_board_by_its_key(): void
    {
        $board = $this->board();

        $this->withServerVariables(['REMOTE_ADDR' => '192.168.1.50'])
            ->getJson("/api/screens/{$board->uuid}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Concourse')
            ->assertJsonPath('data.layout.columns', 24)
            ->assertJsonPath('data.updatedAt', $board->updated_at->toIso8601String());
    }

    public function test_a_board_cannot_be_fetched_by_its_number_or_an_unknown_key(): void
    {
        $board = $this->board();

        $this->getJson("/api/screens/{$board->id}")->assertNotFound()->assertJson(['status' => 404]);
        $this->getJson('/api/screens/not-a-board')->assertNotFound();
    }

    public function test_the_screen_page_itself_is_served(): void
    {
        $this->withoutVite();
        $board = $this->board();

        $this->get("/screen/{$board->uuid}")->assertOk()->assertSee('<div id="root"></div>', false);
    }
}
