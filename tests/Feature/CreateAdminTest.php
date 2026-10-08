<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreateAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_the_admin(): void
    {
        $this->artisan('display:admin', ['email' => 'Andy@Example.test', '--name' => 'Andy'])
            ->expectsQuestion('Password for andy@example.test', 'correct horse battery')
            ->expectsQuestion('The same password again', 'correct horse battery')
            ->assertSuccessful();

        $admin = User::where('email', 'andy@example.test')->firstOrFail();
        $this->assertSame('Andy', $admin->name);
        $this->assertTrue(Hash::check('correct horse battery', $admin->password));
    }

    public function test_gives_an_existing_admin_a_new_password(): void
    {
        User::factory()->create(['email' => 'andy@example.test', 'name' => 'Andy', 'password' => 'old password 123']);

        $this->artisan('display:admin', ['email' => 'andy@example.test'])
            ->expectsQuestion('New password for andy@example.test', 'new password 456')
            ->expectsQuestion('The same password again', 'new password 456')
            ->assertSuccessful();

        $this->assertSame(1, User::count());
        $this->assertTrue(Hash::check('new password 456', User::firstOrFail()->password));
    }

    public function test_refuses_a_short_password_and_a_mismatch(): void
    {
        $this->artisan('display:admin', ['email' => 'andy@example.test', '--name' => 'Andy'])
            ->expectsQuestion('Password for andy@example.test', 'short')
            ->assertFailed();

        $this->artisan('display:admin', ['email' => 'andy@example.test', '--name' => 'Andy'])
            ->expectsQuestion('Password for andy@example.test', 'correct horse battery')
            ->expectsQuestion('The same password again', 'something else')
            ->assertFailed();

        $this->assertSame(0, User::count());
    }

    public function test_refuses_something_that_is_not_an_email(): void
    {
        $this->artisan('display:admin', ['email' => 'andy'])->assertFailed();
    }
}
