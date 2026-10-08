<?php

namespace Tests\Feature;

use App\Data\TargetDatabase;
use App\Data\TargetDatabases;
use App\Models\BoardDataSource;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Support\SqliteTargetDatabase;
use Tests\TestCase;

class JoinAndSqlDataSourceTest extends TestCase
{
    use RefreshDatabase;

    private SqliteTargetDatabase $target;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());

        $this->target = SqliteTargetDatabase::create();
        $schema = Schema::connection(SqliteTargetDatabase::NAME);
        $schema->create('stations', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('code', 3);
        });
        $schema->create('departures', function (Blueprint $t) {
            $t->id();
            $t->foreignId('station_id')->nullable()->constrained('stations');
            $t->string('name'); // the train's name: shares a column name with stations
            $t->string('platform');
            $t->dateTime('departs_at');
        });
        $db = $this->target->connection();
        $db->table('stations')->insert([
            ['name' => 'LONDON EUSTON', 'code' => 'EUS'],
            ['name' => 'MANCHESTER PICCADILLY', 'code' => 'MAN'],
        ]);
        $db->table('departures')->insert([
            ['station_id' => 1, 'name' => 'ROYAL SCOT', 'platform' => '4', 'departs_at' => '2999-01-01 14:32:00'],
            ['station_id' => 2, 'name' => 'PENNINE', 'platform' => '11', 'departs_at' => '2999-01-01 14:47:00'],
            ['station_id' => null, 'name' => 'MYSTERY', 'platform' => '9', 'departs_at' => '2999-01-01 15:05:00'],
        ]);

        $target = $this->target;
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

    private function joined(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Departures with stations',
            'kind' => 'join',
            'table' => 'departures',
            'joins' => [['table' => 'stations', 'type' => 'left', 'from' => 'departures.station_id', 'to' => 'id']],
            'columns' => ['departures.departs_at', 'departures.platform', 'departures.name', 'stations.name', 'stations.code'],
            'filters' => [],
            'sort' => [['column' => 'departures.departs_at', 'direction' => 'asc']],
            'limit' => 10,
            'cacheSeconds' => 30,
        ];
    }

    private function written(string $sql, array $overrides = []): array
    {
        return $overrides + ['name' => 'Written', 'kind' => 'sql', 'sql' => $sql, 'limit' => 10, 'cacheSeconds' => 30];
    }

    // --- The join builder ------------------------------------------------------------------------

    public function test_offers_the_databases_foreign_keys_as_joins(): void
    {
        $this->getJson('/api/schema/foreign-keys')
            ->assertOk()
            ->assertJsonPath('data', [['fromTable' => 'departures', 'fromColumn' => 'station_id', 'toTable' => 'stations', 'toColumn' => 'id']]);
    }

    public function test_joins_tables_naming_columns_plainly_unless_two_share_a_name(): void
    {
        $this->postJson('/api/data-sources/preview', $this->joined())
            ->assertOk()
            ->assertJsonPath('columns', ['departs_at', 'platform', 'departures.name', 'stations.name', 'code'])
            ->assertJsonPath('data.0', [
                'departs_at' => '2999-01-01 14:32:00',
                'platform' => '4',
                'departures.name' => 'ROYAL SCOT',
                'stations.name' => 'LONDON EUSTON',
                'code' => 'EUS',
            ]);
    }

    public function test_a_left_join_keeps_rows_with_no_match_and_an_inner_join_drops_them(): void
    {
        $left = $this->postJson('/api/data-sources/preview', $this->joined())->json('data');
        $this->assertCount(3, $left);
        $this->assertNull($left[2]['stations.name']);

        $inner = $this->joined();
        $inner['joins'][0]['type'] = 'inner';
        $this->assertCount(2, $this->postJson('/api/data-sources/preview', $inner)->json('data'));
    }

    public function test_filters_and_sorts_on_a_joined_tables_columns(): void
    {
        $this->postJson('/api/data-sources/preview', $this->joined([
            'columns' => ['departures.platform'],
            'filters' => [['column' => 'stations.code', 'operator' => 'equals', 'valueKind' => 'value', 'value' => 'MAN']],
            'sort' => [['column' => 'stations.name', 'direction' => 'desc']],
        ]))->assertOk()->assertJsonPath('data', [['platform' => '11']]);
    }

    public function test_refuses_joins_that_do_not_fit_the_database(): void
    {
        $join = fn (array $j) => $this->postJson('/api/data-sources/preview', $this->joined(['joins' => [$j + ['table' => 'stations', 'type' => 'left', 'from' => 'departures.station_id', 'to' => 'id']]]));

        $join(['table' => 'nowhere'])->assertStatus(422)->assertJsonPath('message', 'Join 1: there is no table or view called "nowhere".');
        $join(['to' => 'nope'])->assertStatus(422)->assertJsonPath('message', 'Join 1: "stations" has no column called "nope".');
        $join(['from' => 'platforms.id'])->assertStatus(422)->assertJsonPath('message', 'Join 1: "platforms" is not one of the tables in this query.');
        $join(['type' => 'cross'])->assertStatus(422);
        $join(['table' => 'departures'])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'already in this query'));

        $this->postJson('/api/data-sources/preview', $this->joined(['columns' => ['name']]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Say which table "name" comes from, as table.column.');
    }

    public function test_saves_a_joined_data_source_and_serves_it(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->joined())->assertOk()->assertJsonPath('data.kind', 'join')->json('data.uuid');

        // A column named "stations.name" cannot be reached by a dotted JSON path, so the row is
        // checked whole.
        $this->getJson("/api/board-data/{$uuid}")->assertOk()
            ->assertJsonPath('data.1', fn ($row) => $row['stations.name'] === 'MANCHESTER PICCADILLY');
    }

    // --- Written SQL -----------------------------------------------------------------------------

    public function test_runs_a_written_select_with_its_own_column_names(): void
    {
        $sql = "-- next departures\nSELECT d.departs_at AS due, s.name || ' (' || s.code || ')' AS destination
                  FROM departures d JOIN stations s ON s.id = d.station_id ORDER BY d.departs_at;";

        $this->postJson('/api/data-sources/preview', $this->written($sql))
            ->assertOk()
            ->assertJsonPath('columns', ['due', 'destination'])
            ->assertJsonPath('data.1', ['due' => '2999-01-01 14:47:00', 'destination' => 'MANCHESTER PICCADILLY (MAN)']);
    }

    public function test_the_row_limit_holds_whatever_the_sql_asks_for(): void
    {
        $this->postJson('/api/data-sources/preview', $this->written('SELECT name FROM departures LIMIT 50', ['limit' => 2]))
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_reports_columns_even_when_no_rows_match(): void
    {
        $this->postJson('/api/data-sources/preview', $this->written("SELECT name, platform FROM departures WHERE name = 'NONE'"))
            ->assertOk()
            ->assertJsonPath('columns', ['name', 'platform'])
            ->assertJsonPath('data', []);
    }

    public function test_refuses_anything_but_a_select(): void
    {
        $this->postJson('/api/data-sources/preview', $this->written("UPDATE departures SET name = 'X'"))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Your SQL must be a SELECT (or WITH … SELECT). The board only ever reads.');

        $this->postJson('/api/data-sources/preview', $this->written(''))->assertStatus(422);
    }

    public function test_a_second_statement_cannot_be_slipped_in(): void
    {
        $this->postJson('/api/data-sources/preview', $this->written('SELECT 1; DELETE FROM departures'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_starts_with($m, 'The database could not run this'));

        $this->assertSame(3, $this->target->connection()->table('departures')->count());
    }

    public function test_writing_is_refused_by_the_database_even_from_inside_a_select(): void
    {
        // A WITH ... DELETE is not a SELECT at all in SQLite, but it gets past the "starts with
        // SELECT or WITH" check: it is the read-only guard and the wrapping that refuse it.
        $this->postJson('/api/data-sources/preview', $this->written('WITH x AS (SELECT 1) DELETE FROM departures'))
            ->assertStatus(422);

        $this->assertSame(3, $this->target->connection()->table('departures')->count());
    }

    public function test_written_sql_is_only_saved_once_it_runs(): void
    {
        $this->postJson('/api/data-sources', $this->written('SELECT nonsense FROM nowhere'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_starts_with($m, 'The database could not run this'));
        $this->assertSame(0, BoardDataSource::count());

        $saved = $this->postJson('/api/data-sources', $this->written('SELECT name FROM stations ORDER BY name'))->assertOk()->json('data');
        $this->assertSame('sql', $saved['kind']);
        $this->assertSame('SELECT name FROM stations ORDER BY name', $saved['sql']);
        $this->getJson("/api/board-data/{$saved['uuid']}")->assertOk()->assertJsonPath('data.0.name', 'LONDON EUSTON');
    }

    public function test_screens_get_rows_but_never_the_sql(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->written('SELECT name FROM stations'))->json('data.uuid');
        auth()->forgetGuards();

        $this->getJson("/api/board-data/{$uuid}")->assertOk()->assertDontSee('SELECT')->assertDontSee('stations');
        $this->getJson('/api/data-sources')->assertUnauthorized();
    }
}
