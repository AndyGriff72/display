<?php

namespace Tests\Feature;

use App\Connections\ConnectionProvider;
use App\Models\OrganizationConnection;
use App\Models\User;
use App\Services\ConnectionVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ConnectionApiTest extends TestCase
{
    use RefreshDatabase;

    private FakeVerifier $verifier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());

        // Never reach for a real database server.
        $this->verifier = new FakeVerifier();
        $this->app->instance(ConnectionVerifier::class, $this->verifier);
    }

    private function details(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Departures',
            'driver' => 'mysql',
            'host' => 'db.example.test',
            'port' => 3306,
            'database' => 'trains',
            'username' => 'board',
            'password' => 's3cret',
            'ssl' => false,
        ];
    }

    public function test_there_is_no_connection_to_begin_with(): void
    {
        $this->getJson('/api/connection')
            ->assertOk()
            ->assertJson(['status' => 200, 'data' => null])
            ->assertJsonFragment(['value' => 'mysql', 'label' => 'MySQL', 'port' => 3306]);
    }

    public function test_postgresql_is_not_offered_unless_enabled(): void
    {
        $this->getJson('/api/connection')->assertJsonMissing(['value' => 'pgsql']);
        $this->putJson('/api/connection', $this->details(['driver' => 'pgsql']))->assertStatus(422);
    }

    public function test_saving_stores_the_password_encrypted_and_never_returns_it(): void
    {
        $this->putJson('/api/connection', $this->details())
            ->assertOk()
            ->assertJsonPath('data.hasStoredPassword', true)
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.password_encrypted');

        $raw = DB::table('organization_connections')->value('password_encrypted');
        $this->assertNotEmpty($raw);
        $this->assertStringNotContainsString('s3cret', $raw);

        $connection = OrganizationConnection::firstOrFail();
        $this->assertSame('s3cret', $connection->credentialPassword());
        $this->assertTrue($connection->isVerified());
        $this->assertStringNotContainsString('s3cret', $this->getJson('/api/connection')->getContent());
    }

    public function test_a_connection_that_does_not_work_is_not_saved(): void
    {
        $this->verifier->failWith(ConnectionVerifier::FAILURE_UNREACHABLE, 'access_denied');

        $this->putJson('/api/connection', $this->details())
            ->assertStatus(422)
            ->assertJson(['status' => 422, 'message' => 'The server refused that username and password.']);

        $this->assertSame(0, OrganizationConnection::count());
    }

    public function test_saving_again_updates_the_one_connection_and_a_blank_password_keeps_the_stored_one(): void
    {
        $this->putJson('/api/connection', $this->details())->assertOk();
        $this->putJson('/api/connection', $this->details(['database' => 'buses', 'password' => '']))->assertOk();

        $this->assertSame(1, OrganizationConnection::count());
        $connection = OrganizationConnection::firstOrFail();
        $this->assertSame('buses', $connection->database);
        $this->assertSame('s3cret', $connection->credentialPassword());
        $this->assertSame('s3cret', $this->verifier->lastPassword);
    }

    public function test_the_stored_password_is_never_offered_to_a_different_server(): void
    {
        $this->putJson('/api/connection', $this->details())->assertOk();

        $this->postJson('/api/connection/test', $this->details(['host' => 'attacker.test', 'password' => '']))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Enter the password to test with. It will not be saved.');
        $this->assertSame('s3cret', $this->verifier->lastPassword, 'no attempt was made with the new host');
        $this->assertSame('db.example.test', $this->verifier->lastIdentity['host']);
    }

    public function test_testing_does_not_save_anything(): void
    {
        $this->postJson('/api/connection/test', $this->details())
            ->assertOk()
            ->assertJsonPath('message', 'Connected to Departures successfully.');

        $this->assertSame(0, OrganizationConnection::count());
    }

    public function test_a_tls_failure_says_so(): void
    {
        $this->verifier->failWith(ConnectionVerifier::FAILURE_TLS_UNAVAILABLE, 'not_encrypted');

        $this->postJson('/api/connection/test', $this->details(['ssl' => true]))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'SSL/TLS'));
    }

    public function test_removing_the_connection(): void
    {
        $this->putJson('/api/connection', $this->details())->assertOk();
        $this->deleteJson('/api/connection')->assertOk();

        $this->assertSame(0, OrganizationConnection::count());
    }

    public function test_the_connection_provider_hands_over_the_saved_details_with_the_password(): void
    {
        $this->assertNull(app(ConnectionProvider::class)->params());

        $this->putJson('/api/connection', $this->details())->assertOk();

        $this->assertSame([
            'driver' => 'mysql',
            'host' => 'db.example.test',
            'port' => 3306,
            'database' => 'trains',
            'schema' => null,
            'username' => 'board',
            'password' => 's3cret',
            'ssl' => false,
        ], app(ConnectionProvider::class)->params());
    }

    public function test_the_connection_needs_a_signed_in_user(): void
    {
        auth()->forgetGuards();

        $this->getJson('/api/connection')->assertUnauthorized();
        $this->putJson('/api/connection', $this->details())->assertUnauthorized();
        $this->assertSame(0, OrganizationConnection::count());
    }

    public function test_records_who_saved_the_password(): void
    {
        $this->putJson('/api/connection', $this->details())->assertOk();

        $this->assertSame(auth()->id(), OrganizationConnection::firstOrFail()->credential_saved_by_user_id);
    }

    public function test_an_unknown_api_address_is_a_json_404(): void
    {
        $this->getJson('/api/nothing/here')->assertNotFound()->assertJson(['status' => 404]);
    }
}

/**
 * Stands in for the real verifier: succeeds unless told otherwise, and remembers what it was
 * asked to connect with.
 */
class FakeVerifier extends ConnectionVerifier
{
    public ?string $lastPassword = null;
    public ?array $lastIdentity = null;
    private ?string $failure = null;
    private ?string $detail = null;

    public function failWith(string $failure, string $detail): void
    {
        $this->failure = $failure;
        $this->detail = $detail;
    }

    public function verify(array $identity, string $password, bool $ssl): ?string
    {
        $this->lastIdentity = $identity;
        $this->lastPassword = $password;

        return $this->failure;
    }

    public function lastFailureDetail(): ?string
    {
        return $this->detail;
    }
}
