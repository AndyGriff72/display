<?php

namespace App\Data;

use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Support\Facades\Http;
use SimpleXMLElement;

/**
 * News feeds as board data: one row per story, newest first, from one or more RSS 2.0, Atom or
 * RSS 1.0 feeds merged together.
 *
 *   title, summary, published, author, category, link, feed, image
 *
 * summary is the story's description as plain text; published is its date and time in the data
 * source's time zone, as "Y-m-d H:i:s" (so "{published|HH:mm}" works as for database dates); feed
 * is the feed's name (its own title unless given one); image is the address of the story's
 * picture, if the feed gives one.
 *
 * The server fetches addresses an admin gives it, so it takes care: only http and https, never
 * an address on this machine or a private network (each address is looked up, checked, and then
 * fetched at exactly the address checked, redirects included), with limits on time and size.
 * XML is read with external entities and network access off.
 */
class NewsFeeds
{
    public const COLUMNS = ['title', 'summary', 'published', 'author', 'category', 'link', 'feed', 'image'];

    public const MAX_FEEDS = 10;

    public const MAX_STORIES = 200;

    /** The most a feed may be, in bytes. */
    private const MAX_BYTES = 3 * 1024 * 1024;

    private const TIMEOUT_SECONDS = 8;

    private const MAX_REDIRECTS = 3;

    /** The most of a summary kept, in characters: boards show a line or two. */
    private const SUMMARY_CHARS = 600;

    private const NS = [
        'atom' => 'http://www.w3.org/2005/Atom',
        'rss1' => 'http://purl.org/rss/1.0/',
        'dc' => 'http://purl.org/dc/elements/1.1/',
        'media' => 'http://search.yahoo.com/mrss/',
        'content' => 'http://purl.org/rss/1.0/modules/content/',
    ];

    /** @var Closure(string): list<string> the addresses a host name stands for */
    private Closure $resolve;

    /**
     * @param  (Closure(string): list<string>)|null  $resolve  how host names are looked up (tests give their own)
     */
    public function __construct(?Closure $resolve = null)
    {
        $this->resolve = $resolve ?? Closure::fromCallable([self::class, 'lookUp']);
    }

    /**
     * Fetch the feeds and merge their stories, newest first. A feed that fails is left out if
     * others work; if none works, the first failure is thrown.
     *
     * @param  list<array{url: string, name?: ?string}>  $feeds
     * @return array{columns: list<string>, rows: list<array<string, ?string>>}
     *
     * @throws FeedProblem when no feed can be read
     */
    public function fetch(array $feeds, string $timezone, int $limit): array
    {
        $zone = new \DateTimeZone($timezone);
        $stories = [];
        $failures = [];
        foreach ($feeds as $i => $feed) {
            try {
                $stories = array_merge($stories, $this->read($this->download($feed['url']), $feed['name'] ?? null, $zone));
            } catch (FeedProblem $e) {
                $failures[] = new FeedProblem('Feed ' . ($i + 1) . ': ' . $e->getMessage());
            }
        }
        if ($feeds && count($failures) === count($feeds)) {
            throw $failures[0];
        }

        // Newest first; stories without a date after those with one, in feed order.
        usort($stories, fn ($a, $b) => ($b['_at'] ?? PHP_INT_MIN) <=> ($a['_at'] ?? PHP_INT_MIN));
        $rows = array_map(fn ($s) => array_intersect_key($s, array_flip(self::COLUMNS)), array_slice($stories, 0, max(1, min($limit, self::MAX_STORIES))));

        return ['columns' => self::COLUMNS, 'rows' => array_values($rows)];
    }

    /**
     * Why a feed address cannot be used, or null if it can: for checking an address as typed.
     */
    public function addressProblem(string $url): ?string
    {
        try {
            $this->checked($url);

            return null;
        } catch (FeedProblem $e) {
            return $e->getMessage();
        }
    }

    // --- Fetching, safely ---

    /**
     * The address split up, with the network address it is to be fetched from.
     *
     * @return array{scheme: string, host: string, port: int, ip: string}
     */
    private function checked(string $url): array
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = $parts['host'] ?? '';
        if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
            throw new FeedProblem('the address must start with http:// or https://.');
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new FeedProblem('the address must not contain a user name or password.');
        }
        $host = trim($host, '[]');
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : ($this->resolve)($host);
        if (!$ips) {
            throw new FeedProblem("could not find {$host}.");
        }
        foreach ($ips as $ip) {
            if (!self::isPublic($ip)) {
                throw new FeedProblem('that address is on this machine or a private network, which feeds may not be fetched from.');
            }
        }

        return ['scheme' => $scheme, 'host' => $host, 'port' => (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80)), 'ip' => $ips[0]];
    }

    private function download(string $url): string
    {
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $target = $this->checked($url);
            try {
                $response = Http::timeout(self::TIMEOUT_SECONDS)
                    ->withHeaders(['User-Agent' => 'DisplayBoard/1.0 (news feed reader)', 'Accept' => 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5'])
                    ->withOptions([
                        'allow_redirects' => false,
                        // Fetch from exactly the address checked, so a name cannot be made to
                        // point somewhere else between the check and the fetch.
                        'curl' => [CURLOPT_RESOLVE => ["{$target['host']}:{$target['port']}:" . (str_contains($target['ip'], ':') ? "[{$target['ip']}]" : $target['ip'])]],
                        'on_headers' => function ($response) {
                            if ((int) $response->getHeaderLine('Content-Length') > self::MAX_BYTES) {
                                throw new FeedProblem('the feed is too large.');
                            }
                        },
                    ])
                    ->get($url);
            } catch (FeedProblem $e) {
                throw $e;
            } catch (\Throwable $e) {
                $previous = $e->getPrevious();
                if ($previous instanceof FeedProblem) {
                    throw $previous;
                }
                throw new FeedProblem('could not fetch it (' . class_basename($e) . ').');
            }

            if ($response->redirect()) {
                $location = $response->header('Location');
                if ($location === '') {
                    throw new FeedProblem('it redirects nowhere.');
                }
                $url = self::absolute($location, $url);
                continue;
            }
            if (!$response->successful()) {
                throw new FeedProblem("the site answered {$response->status()}.");
            }
            $body = $response->body();
            if (strlen($body) > self::MAX_BYTES) {
                throw new FeedProblem('the feed is too large.');
            }

            return $body;
        }

        throw new FeedProblem('it redirects too many times.');
    }

    /** @return list<string> */
    private static function lookUp(string $host): array
    {
        $ips = gethostbynamel($host) ?: [];
        $six = @dns_get_record($host, DNS_AAAA) ?: [];
        foreach ($six as $record) {
            if (!empty($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }

        return $ips;
    }

    /** Whether an address is on the public internet: not this machine, a private network, or reserved. */
    public static function isPublic(string $ip): bool
    {
        // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address.
        if (preg_match('/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i', $ip, $m)) {
            $ip = $m[1];
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        // Link-local and unique-local IPv6, whatever PHP's reserved ranges cover.
        return !preg_match('/^(fe[89ab]|f[cd])[0-9a-f]{0,2}:/i', $ip);
    }

    private static function absolute(string $location, string $base): string
    {
        if (preg_match('~^https?://~i', $location)) {
            return $location;
        }
        $b = parse_url($base);
        $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($location, '//')) {
            return $b['scheme'] . ':' . $location;
        }
        if (str_starts_with($location, '/')) {
            return $origin . $location;
        }
        $path = $b['path'] ?? '/';

        return $origin . substr($path, 0, (int) strrpos($path, '/') + 1) . $location;
    }

    // --- Reading ---

    /**
     * The stories in a feed, each with its fields and (as _at) its time for sorting.
     *
     * @return list<array<string, mixed>>
     */
    public function read(string $xml, ?string $name, \DateTimeZone $zone): array
    {
        $previous = libxml_use_internal_errors(true);
        try {
            $doc = simplexml_load_string($xml, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        if ($doc === false) {
            throw new FeedProblem('it is not a feed (it could not be read as XML).');
        }

        $root = strtolower($doc->getName());
        if ($root === 'rss') {
            return $this->rss2($doc, $name, $zone);
        }
        if ($root === 'feed') {
            return $this->atom($doc, $name, $zone);
        }
        if ($root === 'rdf') {
            return $this->rss1($doc, $name, $zone);
        }

        throw new FeedProblem('it is not an RSS or Atom feed.');
    }

    private function rss2(SimpleXMLElement $doc, ?string $name, \DateTimeZone $zone): array
    {
        $channel = $doc->channel;
        $feed = $name ?: self::text((string) $channel->title) ?: 'Feed';
        $stories = [];
        foreach ($channel->item as $item) {
            $dc = $item->children(self::NS['dc']);
            $description = (string) $item->description;
            $content = (string) $item->children(self::NS['content'])->encoded;
            $stories[] = $this->story(
                title: (string) $item->title,
                summary: $description !== '' ? $description : $content,
                when: (string) ($item->pubDate ?: $dc->date),
                author: (string) ($item->author ?: $dc->creator),
                category: (string) $item->category,
                link: (string) $item->link,
                feed: $feed,
                image: self::imageOf($item, $description . ' ' . $content),
                zone: $zone,
            );
        }

        return $stories;
    }

    private function atom(SimpleXMLElement $doc, ?string $name, \DateTimeZone $zone): array
    {
        $atom = $doc->children(self::NS['atom']);
        $feed = $name ?: self::text((string) $atom->title) ?: 'Feed';
        $stories = [];
        foreach ($atom->entry as $entry) {
            $link = '';
            $image = null;
            foreach ($entry->link as $l) {
                $rel = self::attr($l, 'rel') ?: 'alternate';
                if ($rel === 'alternate' && $link === '') {
                    $link = self::attr($l, 'href');
                }
                if ($rel === 'enclosure' && str_starts_with(self::attr($l, 'type'), 'image/')) {
                    $image ??= self::attr($l, 'href');
                }
            }
            $summary = (string) $entry->summary;
            $content = (string) $entry->content;
            $category = $entry->category ? (self::attr($entry->category, 'label') ?: self::attr($entry->category, 'term')) : '';
            $stories[] = $this->story(
                title: (string) $entry->title,
                summary: $summary !== '' ? $summary : $content,
                when: (string) ($entry->published ?: $entry->updated),
                author: (string) $entry->author?->name,
                category: $category,
                link: $link,
                feed: $feed,
                image: $image ?? self::imageOf($entry, $summary . ' ' . $content),
                zone: $zone,
            );
        }

        return $stories;
    }

    private function rss1(SimpleXMLElement $doc, ?string $name, \DateTimeZone $zone): array
    {
        $rss = $doc->children(self::NS['rss1']);
        $feed = $name ?: self::text((string) $rss->channel->title) ?: 'Feed';
        $stories = [];
        foreach ($rss->item as $item) {
            $dc = $item->children(self::NS['dc']);
            $description = (string) $item->description;
            $stories[] = $this->story(
                title: (string) $item->title,
                summary: $description,
                when: (string) $dc->date,
                author: (string) $dc->creator,
                category: (string) $dc->subject,
                link: (string) $item->link,
                feed: $feed,
                image: self::imageOf($item, $description),
                zone: $zone,
            );
        }

        return $stories;
    }

    private function story(string $title, string $summary, string $when, string $author, string $category, string $link, string $feed, ?string $image, \DateTimeZone $zone): array
    {
        $at = null;
        $published = null;
        if (trim($when) !== '') {
            try {
                $time = CarbonImmutable::parse(trim($when))->setTimezone($zone);
                $at = $time->getTimestamp();
                $published = $time->format('Y-m-d H:i:s');
            } catch (\Throwable) {
                // A date the feed wrote in a way nobody can read: the story keeps its place.
            }
        }
        $summary = self::text($summary);
        if (mb_strlen($summary) > self::SUMMARY_CHARS) {
            $summary = rtrim(mb_substr($summary, 0, self::SUMMARY_CHARS - 1)) . '…';
        }

        return [
            'title' => self::text($title),
            'summary' => $summary,
            'published' => $published,
            'author' => self::text($author) ?: null,
            'category' => self::text($category) ?: null,
            'link' => self::webAddress(trim($link)),
            'feed' => $feed,
            'image' => self::webAddress($image),
            '_at' => $at,
        ];
    }

    /** HTML and entities to plain text, on one line. */
    private static function text(string $html): string
    {
        $text = html_entity_decode(strip_tags(preg_replace('~<(br|/p|/div|/li)\b[^>]*>~i', ' ', $html) ?? $html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
    }

    /** A story's picture: a media thumbnail or content, an image enclosure, or the first image in its HTML. */
    private static function imageOf(SimpleXMLElement $item, string $html): ?string
    {
        $media = $item->children(self::NS['media']);
        foreach ([$media->thumbnail, $media->content, $media->group?->content, $media->group?->thumbnail] as $nodes) {
            foreach ($nodes ?? [] as $node) {
                $url = self::attr($node, 'url');
                $type = self::attr($node, 'type');
                $medium = self::attr($node, 'medium');
                if ($url !== '' && ($type === '' || str_starts_with($type, 'image/') || $medium === 'image')) {
                    return $url;
                }
            }
        }
        foreach ($item->enclosure ?? [] as $enclosure) {
            if (str_starts_with(self::attr($enclosure, 'type'), 'image/')) {
                return self::attr($enclosure, 'url');
            }
        }
        if (preg_match('~<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']~i', $html, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        return null;
    }

    /**
     * An attribute with no namespace, as feeds write them. (Indexing an element read from a
     * namespace, such as media:thumbnail, looks in that namespace instead.)
     */
    private static function attr(SimpleXMLElement $node, string $name): string
    {
        return (string) ($node->attributes()[$name] ?? '');
    }

    /** An http or https address as it is, or null for anything else. */
    private static function webAddress(?string $url): ?string
    {
        return $url !== null && preg_match('~^https?://\S+$~i', $url) ? $url : null;
    }
}
