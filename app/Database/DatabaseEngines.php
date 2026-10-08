<?php

namespace App\Database;

use InvalidArgumentException;

/**
 * The database engines a connection can be to, and what each one needs to know about itself.
 *
 * One place, because the same small facts are wanted in many: the label a person sees, the port
 * an engine listens on by default, which discovery module reads its catalogue, and whether this
 * installation offers it at all. Stored on a connection as the key — "mysql", "mariadb", "pgsql" —
 * which is also Laravel's own name for each driver.
 *
 * MySQL and MariaDB are separate entries though one module serves both. The difference matters to
 * the person choosing — an administrator looking at a list of saved connections wants to see which
 * server is which — and costs nothing: both are read by the MySQL module and both connect through
 * Laravel's mysql driver, exactly as every connection did before engines were a choice.
 */
final class DatabaseEngines
{
    public const MYSQL = 'mysql';
    public const MARIADB = 'mariadb';
    public const POSTGRESQL = 'pgsql';

    /** What a connection with no engine recorded is — every one saved before engines existed. */
    public const DEFAULT = self::MYSQL;

    /**
     * @var array<string, array{label: string, port: int, family: string}>
     *
     * `family` is the discovery module and connection builder that serves the engine.
     */
    private const ENGINES = [
        self::MYSQL      => ['label' => 'MySQL',      'port' => 3306, 'family' => self::MYSQL],
        self::MARIADB    => ['label' => 'MariaDB',    'port' => 3306, 'family' => self::MYSQL],
        self::POSTGRESQL => ['label' => 'PostgreSQL', 'port' => 5432, 'family' => self::POSTGRESQL],
    ];

    /**
     * The engine a stored or submitted value names.
     *
     * Absent or empty means the default, which is how every connection saved before this existed
     * reads — and how a session opened before the deploy does. Anything else unrecognised is
     * refused: it would otherwise reach a connection builder that has no idea what it is.
     */
    public static function normalize(?string $engine): string
    {
        $engine = strtolower(trim((string) $engine));

        if ($engine === '') {
            return self::DEFAULT;
        }

        if (!isset(self::ENGINES[$engine])) {
            throw new InvalidArgumentException("Unknown database engine \"{$engine}\".");
        }

        return $engine;
    }

    public static function label(string $engine): string
    {
        return self::ENGINES[self::normalize($engine)]['label'];
    }

    public static function defaultPort(string $engine): int
    {
        return self::ENGINES[self::normalize($engine)]['port'];
    }

    /** The module family that serves this engine: "mysql" for MySQL and MariaDB, "pgsql" for PostgreSQL. */
    public static function family(string $engine): string
    {
        return self::ENGINES[self::normalize($engine)]['family'];
    }

    /** The schema a PostgreSQL connection shows when none has been chosen. */
    public const DEFAULT_POSTGRESQL_SCHEMA = 'public';

    /**
     * The schema a connection shows, from what was stored or submitted.
     *
     * Null for MySQL and MariaDB, where the database is the schema and there is nothing to choose.
     * For PostgreSQL, the one chosen — or `public`, which is where nearly every application's
     * tables live, when none was (roadmap item 4, C5).
     */
    public static function schemaFor(string $engine, ?string $schema): ?string
    {
        if (self::family($engine) !== self::POSTGRESQL) {
            return null;
        }

        $schema = trim((string) $schema);

        return $schema === '' ? self::DEFAULT_POSTGRESQL_SCHEMA : $schema;
    }

    /**
     * Whether this installation lets people connect to the engine.
     *
     * PostgreSQL is off unless DISPLAY_ENABLE_POSTGRESQL says otherwise: the connection code is
     * Redbrix's, but the board has not been tried against a PostgreSQL server yet.
     */
    public static function isEnabled(string $engine): bool
    {
        $engine = self::normalize($engine);

        return $engine !== self::POSTGRESQL || (bool) config('database.postgresql_enabled', false);
    }

    /**
     * Every engine on offer here, in the order a drop-down should list them.
     *
     * @return array<string, string> engine => label
     */
    public static function enabled(): array
    {
        $enabled = [];

        foreach (self::ENGINES as $engine => $spec) {
            if (self::isEnabled($engine)) {
                $enabled[$engine] = $spec['label'];
            }
        }

        return $enabled;
    }
}
