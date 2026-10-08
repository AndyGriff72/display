<?php

namespace App\Services;

use App\Database\DatabaseEngines;
use App\Database\TargetConnections;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PDOException;

/**
 * Proves a set of connection details actually works.
 *
 * Same name, signature and failure values as Redbrix's ConnectionVerifier, so callers port
 * across unchanged; Redbrix's does the work through its session-bound DatabaseConnectionService,
 * this one connects directly. It is also the seam tests replace, so they never try to reach a
 * real server.
 */
class ConnectionVerifier
{
    /** The server could not be reached or refused the details. */
    public const FAILURE_UNREACHABLE = 'unreachable';

    /** SSL/TLS was asked for and the server could not provide it. */
    public const FAILURE_TLS_UNAVAILABLE = 'tls_unavailable';

    /** Names the verification connections are configured under; nothing else uses them. */
    private const DATA = 'verify_target';
    private const CATALOG = 'verify_target_catalog';

    private ?string $lastFailureDetail = null;

    /**
     * Returns null when the details work, or one of the FAILURE_* values.
     *
     * @param array{host: string, port: int|string, database: string, username: string, driver?: string|null, schema?: string|null} $identity
     */
    public function verify(array $identity, string $password, bool $ssl): ?string
    {
        $this->lastFailureDetail = null;
        $driver = DatabaseEngines::normalize($identity['driver'] ?? null);

        TargetConnections::configure(self::DATA, self::CATALOG, [
            'driver' => $driver,
            'schema' => $identity['schema'] ?? null,
            'host' => (string) $identity['host'],
            'port' => (string) $identity['port'],
            'database' => (string) $identity['database'],
            'username' => (string) $identity['username'],
            'password' => $password,
            'ssl' => $ssl,
        ]);

        try {
            DB::connection(self::DATA)->select('SELECT 1');
            DB::connection(self::CATALOG)->select('SELECT 1');

            if ($ssl && !$this->isEncrypted($driver)) {
                $this->lastFailureDetail = 'not_encrypted';

                return self::FAILURE_TLS_UNAVAILABLE;
            }

            return null;
        } catch (\Throwable $exception) {
            Log::warning('Database connection verification failed.', [
                'host' => $identity['host'],
                'port' => $identity['port'],
                'database' => $identity['database'],
                'error' => $exception->getMessage(),
            ]);

            $this->lastFailureDetail = $this->classify($exception);

            return $ssl && stripos($exception->getMessage(), 'ssl') !== false
                ? self::FAILURE_TLS_UNAVAILABLE
                : self::FAILURE_UNREACHABLE;
        } finally {
            DB::purge(self::DATA);
            DB::purge(self::CATALOG);
        }
    }

    /**
     * Why the last attempt failed, more finely than the FAILURE_* value: "access_denied",
     * "unknown_database", "unreachable", "not_encrypted" or "other". Null after a success.
     */
    public function lastFailureDetail(): ?string
    {
        return $this->lastFailureDetail;
    }

    private function isEncrypted(string $driver): bool
    {
        if (DatabaseEngines::family($driver) === DatabaseEngines::POSTGRESQL) {
            // sslmode=require refuses an unencrypted connection, so having connected is proof.
            return true;
        }

        $row = DB::connection(self::DATA)->selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");

        return $row !== null && trim((string) ($row->Value ?? '')) !== '';
    }

    private function classify(\Throwable $exception): string
    {
        $pdo = $exception instanceof PDOException ? $exception : $exception->getPrevious();
        $code = $pdo instanceof PDOException ? (int) ($pdo->errorInfo[1] ?? 0) : 0;
        $message = strtolower($exception->getMessage());

        // MySQL and MariaDB report error numbers; PostgreSQL is recognised by its wording.
        return match (true) {
            $code === 1045, str_contains($message, 'password authentication failed') => 'access_denied',
            $code === 1049, str_contains($message, 'unknown database'),
            str_contains($message, 'database') && str_contains($message, 'does not exist') => 'unknown_database',
            in_array($code, [2002, 2003, 2005, 2006], true),
            str_contains($message, 'timed out'),
            str_contains($message, 'could not connect'),
            str_contains($message, 'connection refused') => 'unreachable',
            default => 'other',
        };
    }
}
