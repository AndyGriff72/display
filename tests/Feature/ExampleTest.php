<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Once signed in, every page path is served the React app's shell, which then routes itself.
     */
    public function test_any_page_path_serves_the_app_shell_when_signed_in(): void
    {
        $this->withoutVite();
        $this->actingAs(User::factory()->create(['name' => 'Andy']));

        $this->get('/')->assertOk()->assertSee('<div id="root"></div>', false)->assertSee('content="Andy"', false);
        $this->get('/boards/some/page')->assertOk()->assertSee('<div id="root"></div>', false);
    }
}
