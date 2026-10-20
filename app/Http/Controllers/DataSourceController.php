<?php

namespace App\Http\Controllers;

use App\Data\DataSourceQuery;
use App\Data\FeedProblem;
use App\Data\InvalidDataSource;
use App\Data\NewsFeeds;
use App\Data\TargetDatabases;
use App\Models\BoardDataSource;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Setting up data sources: list, preview, save, remove.
 *
 * A data source is only saved once it fits the connected database — the table and every column
 * exist — so a screen never fetches a definition that cannot run. A news feed source is only
 * saved once at least one of its feeds can be fetched and read; it needs no database at all.
 */
class DataSourceController extends Controller
{
    /** News feeds are checked at least this often apart, in seconds: feed sites expect polite polling. */
    private const FEED_MIN_SECONDS = 60;

    public function __construct(private TargetDatabases $databases, private NewsFeeds $feeds)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'status' => 200,
            'data' => BoardDataSource::orderBy('name')->get()->map(fn ($s) => $this->present($s))->values(),
            'message' => '',
        ]);
    }

    /**
     * Run a definition as it stands, without saving it and without the cache, so the editor
     * shows exactly what the database returns now. The database's own error is passed on: this
     * is the admin, on this machine, trying to get a query right.
     */
    public function preview(Request $request): JsonResponse
    {
        $definition = $this->definition($this->validated($request));

        if ($definition['kind'] === 'rss') {
            return $this->previewFeeds($definition);
        }

        if (!$database = $this->databases->current()) {
            return $this->refuse('Save a database connection first.', [], 409);
        }

        try {
            $result = (new DataSourceQuery($database))->run($definition);
        } catch (InvalidDataSource $e) {
            return $this->refuse($e->problems[0], $e->problems);
        } catch (QueryException $e) {
            return $this->refuse('The database could not run this: ' . ($e->getPrevious()?->getMessage() ?? $e->getMessage()));
        } catch (\Throwable $e) {
            report($e);

            return $this->refuse('Could not reach the database. Check the connection on the Connection page.', [], 502);
        }

        return response()->json(['status' => 200, 'data' => $result['rows'], 'columns' => $result['columns'], 'message' => '']);
    }

    /** A news feed source's stories as they are now: fetched afresh, not from the cache. */
    private function previewFeeds(array $definition): JsonResponse
    {
        if ($problems = $this->feedProblems($definition)) {
            return $this->refuse($problems[0], $problems);
        }
        try {
            $result = $this->feeds->fetch($definition['feeds'], $definition['timezone'], $definition['limit']);
        } catch (FeedProblem $e) {
            return $this->refuse($e->getMessage());
        }

        return response()->json(['status' => 200, 'data' => $result['rows'], 'columns' => $result['columns'], 'message' => '']);
    }

    /**
     * What is wrong with a news feed source as given: feeds, addresses, number of stories.
     *
     * @return list<string>
     */
    private function feedProblems(array $definition): array
    {
        $problems = [];
        if (!$definition['feeds']) {
            $problems[] = 'Add at least one feed.';
        }
        if (count($definition['feeds']) > NewsFeeds::MAX_FEEDS) {
            $problems[] = 'A data source can merge up to ' . NewsFeeds::MAX_FEEDS . ' feeds.';
        }
        foreach ($definition['feeds'] as $i => $feed) {
            if ($problem = $this->feeds->addressProblem($feed['url'])) {
                $problems[] = 'Feed ' . ($i + 1) . ": {$problem}";
            }
        }
        if ($definition['limit'] < 1 || $definition['limit'] > NewsFeeds::MAX_STORIES) {
            $problems[] = 'Keep between 1 and ' . NewsFeeds::MAX_STORIES . ' stories.';
        }

        return $problems;
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, new BoardDataSource());
    }

    public function update(Request $request, BoardDataSource $dataSource): JsonResponse
    {
        return $this->save($request, $dataSource);
    }

    public function destroy(BoardDataSource $dataSource): JsonResponse
    {
        $dataSource->delete();

        return response()->json(['status' => 200, 'data' => null, 'message' => 'Data source removed.']);
    }

    private function save(Request $request, BoardDataSource $source): JsonResponse
    {
        $input = $this->validated($request);
        $definition = $this->definition($input);

        if ($definition['kind'] === 'rss') {
            return $this->saveFeeds($input, $definition, $source);
        }

        if (!$database = $this->databases->current()) {
            return $this->refuse('Save a database connection first.', [], 409);
        }

        try {
            $query = new DataSourceQuery($database);
            $problems = $query->problems($definition);
            // Written SQL is only saved once the database has run it: the shape checks above
            // cannot tell whether it is valid SQL for this database.
            if (!$problems && $definition['kind'] === 'sql') {
                $query->run($definition);
            }
        } catch (QueryException $e) {
            return $this->refuse('The database could not run this: ' . ($e->getPrevious()?->getMessage() ?? $e->getMessage()));
        } catch (\Throwable $e) {
            report($e);

            return $this->refuse('Could not reach the database to check this. Check the connection on the Connection page.', [], 502);
        }

        if ($problems) {
            return $this->refuse($problems[0], $problems);
        }

        $source->fill([
            'name' => $input['name'],
            'kind' => $definition['kind'],
            'table_name' => $definition['table'],
            'joins' => $definition['kind'] === 'join' ? $definition['joins'] : null,
            'sql' => $definition['kind'] === 'sql' ? $definition['sql'] : null,
            'feeds' => null,
            'timezone' => null,
            'columns' => $definition['columns'],
            'filters' => $definition['filters'],
            'sort' => $definition['sort'],
            'row_limit' => $definition['limit'],
            'cache_seconds' => $input['cacheSeconds'],
        ])->save();

        return response()->json(['status' => 200, 'data' => $this->present($source), 'message' => 'Data source saved.']);
    }

    /** A news feed source, saved once at least one of its feeds can be fetched and read. */
    private function saveFeeds(array $input, array $definition, BoardDataSource $source): JsonResponse
    {
        if ($problems = $this->feedProblems($definition)) {
            return $this->refuse($problems[0], $problems);
        }
        if (($input['cacheSeconds'] ?? 0) < self::FEED_MIN_SECONDS) {
            return $this->refuse('Check news feeds at most once a minute: feed sites expect polite polling.');
        }
        try {
            $this->feeds->fetch($definition['feeds'], $definition['timezone'], $definition['limit']);
        } catch (FeedProblem $e) {
            return $this->refuse($e->getMessage());
        }

        $source->fill([
            'name' => $input['name'],
            'kind' => 'rss',
            'table_name' => '',
            'joins' => null,
            'sql' => null,
            'feeds' => $definition['feeds'],
            'timezone' => $definition['timezone'],
            'columns' => NewsFeeds::COLUMNS,
            'filters' => [],
            'sort' => [],
            'row_limit' => $definition['limit'],
            'cache_seconds' => $input['cacheSeconds'],
        ])->save();

        return response()->json(['status' => 200, 'data' => $this->present($source), 'message' => 'Data source saved.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'kind' => ['sometimes', 'in:table,join,sql,rss'],
            'table' => ['required_unless:kind,sql,rss', 'nullable', 'string', 'max:255'],
            'joins' => ['sometimes', 'array', 'max:10'],
            'joins.*.table' => ['required', 'string', 'max:255'],
            'joins.*.type' => ['required', 'string'],
            'joins.*.from' => ['required', 'string', 'max:511'],
            'joins.*.to' => ['required', 'string', 'max:255'],
            'sql' => ['required_if:kind,sql', 'nullable', 'string'],
            'feeds' => ['required_if:kind,rss', 'array', 'max:' . NewsFeeds::MAX_FEEDS],
            'feeds.*.url' => ['required', 'string', 'max:2048'],
            'feeds.*.name' => ['nullable', 'string', 'max:100'],
            'timezone' => ['required_if:kind,rss', 'nullable', 'timezone:all'],
            'columns' => ['required_unless:kind,sql,rss', 'array', 'max:50'],
            'columns.*' => ['string', 'max:511'],
            'filters' => ['sometimes', 'array', 'max:20'],
            'filters.*.column' => ['required', 'string', 'max:255'],
            'filters.*.operator' => ['required', 'string'],
            'filters.*.valueKind' => ['required', 'string'],
            'filters.*.value' => ['nullable', 'string', 'max:255'],
            'sort' => ['sometimes', 'array', 'max:5'],
            'sort.*.column' => ['required', 'string', 'max:255'],
            'sort.*.direction' => ['required', 'string'],
            'limit' => ['required', 'integer'],
            'cacheSeconds' => ['sometimes', 'required', 'integer', 'between:5,3600'],
        ], [
            'name.required' => 'Give the data source a name.',
            'columns.required_unless' => 'Choose at least one column.',
            'table.required_unless' => 'Choose a table.',
            'sql.required_if' => 'Write the SELECT that gives the board its rows.',
            'feeds.required_if' => 'Add at least one feed.',
            'feeds.*.url.required' => 'Give every feed its address.',
            'timezone.timezone' => 'Choose a time zone from the list.',
            'cacheSeconds.between' => 'Refresh between every 5 seconds and once an hour.',
        ]);
    }

    /** The request in the shape DataSourceQuery takes. */
    private function definition(array $input): array
    {
        $kind = $input['kind'] ?? 'table';
        if ($kind === 'sql') {
            // Written SQL does its own choosing, joining, filtering and sorting.
            return ['kind' => 'sql', 'table' => '', 'joins' => [], 'sql' => (string) $input['sql'], 'feeds' => [], 'timezone' => null, 'columns' => [], 'filters' => [], 'sort' => [], 'limit' => (int) $input['limit']];
        }
        if ($kind === 'rss') {
            // News feeds: each story is a row, with the same columns whatever the feed.
            $feeds = array_values(array_map(fn ($f) => [
                'url' => trim($f['url']),
                'name' => isset($f['name']) && trim($f['name']) !== '' ? trim($f['name']) : null,
            ], $input['feeds'] ?? []));

            return ['kind' => 'rss', 'table' => '', 'joins' => [], 'sql' => null, 'feeds' => $feeds, 'timezone' => $input['timezone'] ?? config('app.timezone'), 'columns' => NewsFeeds::COLUMNS, 'filters' => [], 'sort' => [], 'limit' => (int) $input['limit']];
        }

        return [
            'kind' => $kind,
            'table' => $input['table'],
            'joins' => $kind === 'join' ? array_values(array_map(fn ($j) => [
                'table' => $j['table'],
                'type' => $j['type'],
                'from' => $j['from'],
                'to' => $j['to'],
            ], $input['joins'] ?? [])) : [],
            'sql' => null,
            'feeds' => [],
            'timezone' => null,
            'columns' => array_values($input['columns']),
            'filters' => array_values(array_map(fn ($f) => [
                'column' => $f['column'],
                'operator' => $f['operator'],
                'valueKind' => $f['valueKind'],
                'value' => $f['value'] ?? null,
            ], $input['filters'] ?? [])),
            'sort' => array_values(array_map(fn ($s) => [
                'column' => $s['column'],
                'direction' => $s['direction'],
            ], $input['sort'] ?? [])),
            'limit' => (int) $input['limit'],
        ];
    }

    /** @param list<string> $problems */
    private function refuse(string $message, array $problems = [], int $status = 422): JsonResponse
    {
        return response()->json(['status' => $status, 'data' => null, 'message' => $message, 'problems' => $problems], $status);
    }

    private function present(BoardDataSource $source): array
    {
        return [
            'id' => $source->id,
            'uuid' => $source->uuid,
            'name' => $source->name,
            'kind' => $source->kind ?? 'table',
            'table' => $source->table_name,
            'joins' => $source->joins ?? [],
            'sql' => $source->sql,
            'feeds' => $source->feeds ?? [],
            'timezone' => $source->timezone,
            'columns' => $source->columns,
            'filters' => $source->filters,
            'sort' => $source->sort,
            'limit' => $source->row_limit,
            'cacheSeconds' => $source->cache_seconds,
            'dataUrl' => url('/api/board-data/' . $source->uuid),
        ];
    }
}
