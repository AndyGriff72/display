<?php

namespace Tests\Feature;

use App\Models\Board;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    private function admin(): User
    {
        return User::factory()->create(['email' => 'andy@example.test', 'password' => 'correct horse battery']);
    }

    public function test_the_editor_sends_a_visitor_to_sign_in(): void
    {
        $this->get('/')->assertRedirect('/login');
        $this->get('/boards/1')->assertRedirect('/login');
        $this->get('/data-sources')->assertRedirect('/login');
    }

    public function test_every_setting_up_request_needs_a_signed_in_user(): void
    {
        foreach (['/api/connection', '/api/data-sources', '/api/boards', '/api/schema/tables'] as $path) {
            $this->getJson($path)->assertUnauthorized();
        }
    }

    public function test_screens_and_their_data_need_no_sign_in(): void
    {
        $board = Board::create(['name' => 'Concourse', 'layout' => ['columns' => 4, 'rows' => 1, 'cell' => ['type' => 'splitflap', 'width' => 30, 'height' => 40]]]);

        $this->get("/screen/{$board->uuid}")->assertOk()->assertSee('<div id="root"></div>', false);
        $this->getJson("/api/screens/{$board->uuid}")->assertOk();
        $this->getJson('/api/board-data/unknown')->assertNotFound();
    }

    public function test_signing_in_and_out(): void
    {
        $admin = $this->admin();

        $this->get('/login')->assertOk()->assertSee('Sign in');
        $this->post('/login', ['email' => 'andy@example.test', 'password' => 'correct horse battery'])->assertRedirect('/');
        $this->assertAuthenticatedAs($admin);
        $this->assertNotNull($admin->fresh()->last_seen_at);

        $this->get('/')->assertOk();
        $this->get('/login')->assertRedirect('/');

        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_a_wrong_password_is_refused_without_saying_which_part_was_wrong(): void
    {
        $this->admin();

        $this->from('/login')->post('/login', ['email' => 'andy@example.test', 'password' => 'wrong'])
            ->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest();
    }

    public function test_signing_in_returns_to_the_page_asked_for(): void
    {
        $this->admin();

        $this->get('/data-sources')->assertRedirect('/login');
        $this->post('/login', ['email' => 'andy@example.test', 'password' => 'correct horse battery'])->assertRedirect('/data-sources');
    }

    public function test_repeated_wrong_passwords_are_slowed_down(): void
    {
        $this->admin();

        foreach (range(1, 5) as $_) {
            $this->from('/login')->post('/login', ['email' => 'andy@example.test', 'password' => 'wrong']);
        }

        $this->from('/login')->post('/login', ['email' => 'andy@example.test', 'password' => 'correct horse battery'])
            ->assertSessionHasErrors(['email' => 'Too many sign-in attempts. Please wait a minute and try again.']);
        $this->assertGuest();
    }

    public function test_there_is_no_sign_up_page(): void
    {
        $this->get('/register')->assertRedirect('/login');
        $this->post('/register', ['email' => 'x@example.test', 'password' => 'whatever123'])->assertStatus(405);
    }

    public function test_passwords_are_stored_as_bcrypt_hashes_like_redbrix(): void
    {
        $admin = $this->admin();

        $this->assertStringStartsWith('$2y$', $admin->getAuthPassword());
        $this->assertTrue(Hash::check('correct horse battery', $admin->getAuthPassword()));
    }
}
