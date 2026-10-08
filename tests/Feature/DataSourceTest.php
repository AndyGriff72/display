<?php

namespace Tests\Feature;

use App\Data\TargetDatabase;
use App\Data\TargetDatabases;
use App\Models\BoardDataSource;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Tests\Support\SqliteTargetDatabase;
use Tests\TestCase;

class DataSourceTest extends TestCase
{
    use RefreshDatabase;

    private SqliteTargetDatabase $target;
    private bool $databaseDown = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->target = SqliteTargetDatabase::create();
        Schema::connection(SqliteTargetDatabase::NAME)->create('departures', function (Blueprint $t) {
            $t->id();
            $t->string('destination');
            $t->string('platform')->nullable();
            $t->string('status');
            $t->dateTime('departs_at');
        });
        $this->target->connection()->table('departures')->insert([
            ['destination' => 'LONDON EUSTON', 'platform' => '4', 'status' => 'ON TIME', 'departs_at' => '2999-01-01 14:32:00'],
            ['destination' => 'MANCHESTER', 'platform' => '11', 'status' => 'DELAYED', 'departs_at' => '2999-01-01 14:47:00'],
            ['destination' => 'EDINBURGH', 'platform' => null, 'status' => 'CANCELLED', 'departs_at' => '2999-01-01 15:05:00'],
            ['destination' => 'GLASGOW', 'platform' => '9', 'status' => 'DEPARTED', 'departs_at' => '2000-01-01 09:00:00'],
            ['destination' => '100% LEEDS_X', 'platform' => '2', 'status' => 'ON TIME', 'departs_at' => '2999-01-01 16:00:00'],
        ]);

        $test = $this;
        $this->app->instance(TargetDatabases::class, new class($test) extends TargetDatabases {
            public function __construct(private DataSourceTest $test)
            {
            }

            public function current(): ?TargetDatabase
            {
                return $this->test->currentTarget();
            }
        });
    }

    /** @internal for the stand-in TargetDatabases above */
    public function currentTarget(): ?TargetDatabase
    {
        if ($this->databaseDown) {
            throw new \RuntimeException('Connection refused');
        }

        return $this->target;
    }

    private function definition(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Departures',
            'table' => 'departures',
            'columns' => ['departs_at', 'destination', 'platform', 'status'],
            'filters' => [],
            'sort' => [['column' => 'departs_at', 'direction' => 'asc']],
            'limit' => 10,
            'cacheSeconds' => 30,
        ];
    }

    private function preview(array $overrides = [])
    {
        return $this->postJson('/api/data-sources/preview', $this->definition($overrides));
    }

    // --- The editor's view of the database ---------------------------------------------------

    public function test_lists_the_tables_and_a_tables_columns(): void
    {
        $this->getJson('/api/schema/tables')->assertOk()->assertJsonFragment(['name' => 'departures', 'type' => 'table']);
        $this->getJson('/api/schema/tables/departures/columns')
            ->assertOk()
            ->assertJsonFragment(['name' => 'destination']);
    }

    // --- What a query returns ----------------------------------------------------------------

    public function test_returns_the_chosen_columns_in_order_sorted_and_limited(): void
    {
        $this->preview(['columns' => ['destination', 'status'], 'limit' => 2])
            ->assertOk()
            ->assertJsonPath('columns', ['destination', 'status'])
            ->assertJsonPath('data', [
                ['destination' => 'GLASGOW', 'status' => 'DEPARTED'],
                ['destination' => 'LONDON EUSTON', 'status' => 'ON TIME'],
            ]);
    }

    public function test_sorts_descending(): void
    {
        $this->preview(['columns' => ['destination'], 'sort' => [['column' => 'departs_at', 'direction' => 'desc']], 'limit' => 1])
            ->assertJsonPath('data.0.destination', '100% LEEDS_X');
    }

    public function test_filters_by_value(): void
    {
        $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'status', 'operator' => 'equals', 'valueKind' => 'value', 'value' => 'ON TIME'],
        ]])->assertJsonPath('data', [['destination' => 'LONDON EUSTON'], ['destination' => '100% LEEDS_X']]);
    }

    public function test_filters_from_now_on_using_the_databases_clock(): void
    {
        $response = $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'departs_at', 'operator' => 'at_least', 'valueKind' => 'now', 'value' => null],
        ]]);

        $this->assertNotContains(['destination' => 'GLASGOW'], $response->json('data'));
        $this->assertCount(4, $response->json('data'));
    }

    public function test_filters_on_having_no_value(): void
    {
        $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'platform', 'operator' => 'has_no_value', 'valueKind' => 'value', 'value' => null],
        ]])->assertJsonPath('data', [['destination' => 'EDINBURGH']]);
    }

    public function test_contains_treats_percent_and_underscore_as_ordinary_characters(): void
    {
        $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'destination', 'operator' => 'contains', 'valueKind' => 'value', 'value' => '0% L'],
        ]])->assertJsonPath('data', [['destination' => '100% LEEDS_X']]);

        $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'destination', 'operator' => 'contains', 'valueKind' => 'value', 'value' => '_'],
        ]])->assertJsonPath('data', [['destination' => '100% LEEDS_X']]);
    }

    // --- What is refused ---------------------------------------------------------------------

    public function test_refuses_a_table_or_column_that_does_not_exist(): void
    {
        $this->preview(['table' => 'users'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'There is no table or view called "users".');

        $this->preview(['columns' => ['destination', 'fare']])
            ->assertStatus(422)
            ->assertJsonPath('message', '"departures" has no column called "fare".');
    }

    public function test_sql_in_a_name_is_just_a_name_that_does_not_exist(): void
    {
        $this->preview(['table' => 'departures; DROP TABLE departures'])->assertStatus(422);
        $this->preview(['columns' => ['destination FROM departures; --']])->assertStatus(422);
        $this->preview(['sort' => [['column' => '(SELECT 1)', 'direction' => 'asc']]])->assertStatus(422);

        $this->assertTrue(Schema::connection(SqliteTargetDatabase::NAME)->hasTable('departures'));
    }

    public function test_sql_in_a_value_is_just_a_value(): void
    {
        $this->preview(['columns' => ['destination'], 'filters' => [
            ['column' => 'status', 'operator' => 'equals', 'valueKind' => 'value', 'value' => "x' OR '1'='1"],
        ]])->assertOk()->assertJsonPath('data', []);
    }

    public function test_refuses_unknown_operators_directions_and_out_of_range_limits(): void
    {
        $this->preview(['filters' => [['column' => 'status', 'operator' => 'LIKE', 'valueKind' => 'value', 'value' => '%']]])
            ->assertStatus(422);
        $this->preview(['sort' => [['column' => 'status', 'direction' => 'sideways']]])->assertStatus(422);
        $this->preview(['limit' => 0])->assertStatus(422);
        $this->preview(['limit' => 101])->assertStatus(422);
    }

    public function test_refuses_now_with_contains(): void
    {
        $this->preview(['filters' => [['column' => 'departs_at', 'operator' => 'contains', 'valueKind' => 'now', 'value' => null]]])
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'now and today'));
    }

    // --- Saving and serving ------------------------------------------------------------------

    public function test_saves_a_data_source_and_serves_its_rows_at_its_unguessable_address(): void
    {
        $saved = $this->postJson('/api/data-sources', $this->definition(['columns' => ['destination'], 'limit' => 1]))
            ->assertOk()
            ->json('data');

        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $saved['uuid']);
        $this->assertStringEndsWith('/api/board-data/' . $saved['uuid'], $saved['dataUrl']);

        $this->getJson('/api/board-data/' . $saved['uuid'])
            ->assertOk()
            ->assertJson(['status' => 200, 'data' => [['destination' => 'GLASGOW']], 'columns' => ['destination'], 'stale' => false, 'refreshSeconds' => 30]);

        $this->getJson('/api/board-data/' . $saved['id'])->assertNotFound();
    }

    public function test_will_not_save_a_data_source_that_does_not_fit_the_database(): void
    {
        $this->postJson('/api/data-sources', $this->definition(['columns' => ['fare']]))->assertStatus(422);
        $this->assertSame(0, BoardDataSource::count());
    }

    public function test_reuses_a_result_until_it_expires(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->definition(['columns' => ['destination'], 'limit' => 1]))->json('data.uuid');

        $this->getJson("/api/board-data/{$uuid}")->assertJsonPath('data.0.destination', 'GLASGOW');
        $this->target->connection()->table('departures')->where('destination', 'GLASGOW')->update(['destination' => 'GLASGOW CENTRAL']);
        $this->getJson("/api/board-data/{$uuid}")->assertJsonPath('data.0.destination', 'GLASGOW');

        $this->travel(31)->seconds();
        $this->getJson("/api/board-data/{$uuid}")->assertJsonPath('data.0.destination', 'GLASGOW CENTRAL');
    }

    public function test_editing_a_data_source_takes_effect_at_once(): void
    {
        $saved = $this->postJson('/api/data-sources', $this->definition(['columns' => ['destination'], 'limit' => 1]))->json('data');
        $this->getJson("/api/board-data/{$saved['uuid']}")->assertJsonPath('data.0.destination', 'GLASGOW');

        $this->putJson("/api/data-sources/{$saved['id']}", $this->definition(['columns' => ['status'], 'limit' => 1]))->assertOk();
        $this->getJson("/api/board-data/{$saved['uuid']}")->assertJsonPath('data.0.status', 'DEPARTED');
    }

    public function test_keeps_showing_the_last_good_rows_marked_stale_when_the_database_is_down(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->definition(['columns' => ['destination'], 'limit' => 1]))->json('data.uuid');
        $this->getJson("/api/board-data/{$uuid}")->assertJsonPath('stale', false);

        $this->databaseDown = true;
        $this->travel(31)->seconds();

        $this->getJson("/api/board-data/{$uuid}")
            ->assertOk()
            ->assertJsonPath('stale', true)
            ->assertJsonPath('data.0.destination', 'GLASGOW');
    }

    public function test_says_nothing_about_why_when_there_is_no_data_to_fall_back_on(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->definition())->json('data.uuid');
        Cache::flush();
        $this->databaseDown = true;

        $this->getJson("/api/board-data/{$uuid}")
            ->assertStatus(503)
            ->assertJson(['message' => "The board's data is not available right now."])
            ->assertDontSee('refused');
    }

    public function test_setting_up_is_refused_from_other_machines_but_screens_can_fetch_data(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->definition())->json('data.uuid');

        $remote = $this->withServerVariables(['REMOTE_ADDR' => '192.168.1.50']);
        $remote->getJson('/api/data-sources')->assertForbidden();
        $remote->getJson('/api/schema/tables')->assertForbidden();
        $remote->postJson('/api/data-sources/preview', $this->definition())->assertForbidden();
        $remote->getJson("/api/board-data/{$uuid}")->assertOk();
    }

    public function test_removing_a_data_source(): void
    {
        $saved = $this->postJson('/api/data-sources', $this->definition())->json('data');
        $this->deleteJson("/api/data-sources/{$saved['id']}")->assertOk();
        $this->getJson("/api/board-data/{$saved['uuid']}")->assertNotFound();
    }
}
