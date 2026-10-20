<?php

namespace Tests\Feature;

use App\Data\NewsFeeds;
use App\Data\TargetDatabase;
use App\Data\TargetDatabases;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** News feeds as data sources: read, merged, safe to fetch, and served to boards. */
class NewsFeedTest extends TestCase
{
    use RefreshDatabase;

    private const RSS = <<<'XML'
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel>
            <title>Station News</title>
            <item>
              <title>Trains &amp; buses back to normal</title>
              <link>https://news.example/trains</link>
              <description><![CDATA[<p>Services resumed <b>this morning</b>.</p><img src="https://news.example/inline.jpg">]]></description>
              <pubDate>Mon, 19 Oct 2026 08:30:00 GMT</pubDate>
              <dc:creator>Jo Smith</dc:creator>
              <category>Transport</category>
              <media:thumbnail url="https://news.example/trains.jpg" width="240" height="135"/>
            </item>
            <item>
              <title>Older story</title>
              <link>https://news.example/older</link>
              <description>Plain text.</description>
              <pubDate>Sun, 18 Oct 2026 22:00:00 +0000</pubDate>
            </item>
          </channel>
        </rss>
        XML;

    private const ATOM = <<<'XML'
        <?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Weather Desk</title>
          <entry>
            <title type="html">Fog this evening</title>
            <link rel="alternate" href="https://weather.example/fog"/>
            <link rel="enclosure" type="image/png" href="https://weather.example/fog.png"/>
            <published>2026-10-19T12:00:00+02:00</published>
            <summary>Visibility &lt;b&gt;poor&lt;/b&gt; later.</summary>
            <author><name>Met Desk</name></author>
            <category term="weather" label="Weather"/>
          </entry>
        </feed>
        XML;

    private const RSS1 = <<<'XML'
        <?xml version="1.0"?>
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel rdf:about="https://old.example/"><title>Old Format</title></channel>
          <item rdf:about="https://old.example/1">
            <title>RDF story</title>
            <link>https://old.example/1</link>
            <description>From an RSS 1.0 feed.</description>
            <dc:date>2026-10-19T09:00:00Z</dc:date>
          </item>
        </rdf:RDF>
        XML;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
        // Host names as the tests need them: the .example sites public, "intranet" private.
        $this->app->instance(NewsFeeds::class, new NewsFeeds(fn (string $host) => match (true) {
            str_starts_with($host, 'intranet') => ['10.1.2.3'],
            str_ends_with($host, '.example') => ['93.184.216.34'],
            default => [],
        }));
        // No database connection at all: news feeds need none.
        $this->app->instance(TargetDatabases::class, new class extends TargetDatabases {
            public function __construct()
            {
            }

            public function current(): ?TargetDatabase
            {
                return null;
            }
        });
        Http::fake([
            'news.example/rss' => Http::response(self::RSS, 200, ['Content-Type' => 'application/rss+xml']),
            'weather.example/atom' => Http::response(self::ATOM, 200, ['Content-Type' => 'application/atom+xml']),
            'old.example/rdf' => Http::response(self::RSS1, 200),
            'news.example/moved' => Http::response('', 301, ['Location' => 'http://intranet.example/feed']),
            'news.example/missing' => Http::response('Not here', 404),
            'news.example/html' => Http::response('<html><body>Not a feed</body></html>', 200),
        ]);
    }

    private function feeds(array $urls, array $overrides = []): array
    {
        return $overrides + [
            'name' => 'News',
            'kind' => 'rss',
            'feeds' => array_map(fn ($u) => ['url' => $u], $urls),
            'timezone' => 'Europe/London',
            'limit' => 20,
            'cacheSeconds' => 300,
        ];
    }

    public function test_reads_rss_atom_and_rss1_merged_newest_first_in_local_time(): void
    {
        $rows = $this->postJson('/api/data-sources/preview', $this->feeds(['https://news.example/rss', 'https://weather.example/atom', 'https://old.example/rdf']))
            ->assertOk()
            ->assertJsonPath('columns', NewsFeeds::COLUMNS)
            ->json('data');

        // 12:00 +02:00 is 10:00 UTC, 11:00 in London (summer time); 09:00Z is 10:00; 08:30 GMT is 09:30.
        $this->assertSame(['Fog this evening', 'RDF story', 'Trains & buses back to normal', 'Older story'], array_column($rows, 'title'));
        $this->assertSame(['2026-10-19 11:00:00', '2026-10-19 10:00:00', '2026-10-19 09:30:00', '2026-10-18 23:00:00'], array_column($rows, 'published'));

        $trains = $rows[2];
        $this->assertSame('Services resumed this morning.', $trains['summary']);
        $this->assertSame('Jo Smith', $trains['author']);
        $this->assertSame('Transport', $trains['category']);
        $this->assertSame('https://news.example/trains', $trains['link']);
        $this->assertSame('Station News', $trains['feed']);
        $this->assertSame('https://news.example/trains.jpg', $trains['image']);

        $fog = $rows[0];
        $this->assertSame('Visibility poor later.', $fog['summary']);
        $this->assertSame('Weather', $fog['category']);
        $this->assertSame('https://weather.example/fog.png', $fog['image']);
        $this->assertSame('Weather Desk', $fog['feed']);
    }

    public function test_a_feed_can_be_given_its_own_name_and_the_number_of_stories_is_kept_to(): void
    {
        $rows = $this->postJson('/api/data-sources/preview', $this->feeds([], [
            'feeds' => [['url' => 'https://news.example/rss', 'name' => 'Local']],
            'limit' => 1,
        ]))->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame('Local', $rows[0]['feed']);
    }

    public function test_saves_without_a_database_and_serves_all_feeds_or_just_one(): void
    {
        $uuid = $this->postJson('/api/data-sources', $this->feeds(['https://news.example/rss', 'https://weather.example/atom']))
            ->assertOk()
            ->assertJsonPath('data.kind', 'rss')
            ->assertJsonPath('data.feeds.1.url', 'https://weather.example/atom')
            ->assertJsonPath('data.timezone', 'Europe/London')
            ->json('data.uuid');

        $this->getJson("/api/board-data/{$uuid}")->assertOk()->assertJsonCount(3, 'data');
        $this->getJson("/api/board-data/{$uuid}?feed=1")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.feed', 'Weather Desk');
        $this->getJson("/api/board-data/{$uuid}?feed=0")->assertOk()->assertJsonCount(2, 'data');
        // A feed it does not have: all of them.
        $this->getJson("/api/board-data/{$uuid}?feed=7")->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_leaves_out_a_feed_that_fails_but_refuses_when_none_works(): void
    {
        $this->postJson('/api/data-sources/preview', $this->feeds(['https://news.example/missing', 'https://weather.example/atom']))
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->postJson('/api/data-sources/preview', $this->feeds(['https://news.example/missing']))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Feed 1: the site answered 404.');
        $this->postJson('/api/data-sources', $this->feeds(['https://news.example/html']))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Feed 1: it is not an RSS or Atom feed.');
    }

    public function test_never_fetches_from_this_machine_or_a_private_network(): void
    {
        foreach (['http://intranet.example/feed', 'http://127.0.0.1/feed', 'http://[::1]/feed', 'http://192.168.1.10/feed', 'http://169.254.169.254/latest'] as $url) {
            $this->postJson('/api/data-sources/preview', $this->feeds([$url]))
                ->assertStatus(422)
                ->assertJsonPath('message', fn ($m) => str_contains($m, 'private network'));
        }
        // Nor by way of a redirect.
        $this->postJson('/api/data-sources/preview', $this->feeds(['https://news.example/moved']))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'private network'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'intranet'));

        $this->postJson('/api/data-sources/preview', $this->feeds(['file:///etc/passwd']))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Feed 1: the address must start with http:// or https://.');
    }

    public function test_asks_for_a_polite_refresh_and_a_real_time_zone(): void
    {
        $this->postJson('/api/data-sources', $this->feeds(['https://news.example/rss'], ['cacheSeconds' => 10]))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'once a minute'));
        $this->postJson('/api/data-sources', $this->feeds(['https://news.example/rss'], ['timezone' => 'Mars/Olympus']))
            ->assertStatus(422);
    }

    public function test_reads_xml_without_loading_external_entities(): void
    {
        $evil = '<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///' . str_replace('\\', '/', base_path('composer.json')) . '">]>'
            . '<rss version="2.0"><channel><title>T</title><item><title>&x;</title></item></channel></rss>';
        $stories = (new NewsFeeds(fn () => ['93.184.216.34']))->read($evil, null, new \DateTimeZone('UTC'));

        $this->assertStringNotContainsString('require', $stories[0]['title'] ?? '');
    }

    public function test_judges_addresses_public_or_private(): void
    {
        foreach (['93.184.216.34', '8.8.8.8', '2606:4700::1111'] as $ip) {
            $this->assertTrue(NewsFeeds::isPublic($ip), $ip);
        }
        foreach (['10.0.0.1', '172.16.5.4', '192.168.0.1', '127.0.0.1', '0.0.0.0', '169.254.1.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1'] as $ip) {
            $this->assertFalse(NewsFeeds::isPublic($ip), $ip);
        }
    }
}
