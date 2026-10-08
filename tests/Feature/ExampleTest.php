<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * Every page path is served the React app's shell, which then routes itself.
     */
    public function test_any_page_path_serves_the_app_shell(): void
    {
        $this->withoutVite();

        $this->get('/')->assertOk()->assertSee('<div id="root"></div>', false);
        $this->get('/boards/some/page')->assertOk()->assertSee('<div id="root"></div>', false);
    }
}
