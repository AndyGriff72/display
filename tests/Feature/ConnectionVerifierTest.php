<?php

namespace Tests\Feature;

use App\Services\ConnectionVerifier;
use Tests\TestCase;

/**
 * The real verifier, against an address where nothing is listening, so it needs no database
 * server. One test, because each refused attempt takes several seconds on Windows, which
 * retries before giving up.
 */
class ConnectionVerifierTest extends TestCase
{
    public function test_a_server_that_is_not_there_is_reported_unreachable_and_nothing_is_left_connected(): void
    {
        $verifier = new ConnectionVerifier();

        $failure = $verifier->verify(
            ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => 1, 'database' => 'nothing', 'username' => 'nobody'],
            'irrelevant',
            false,
        );

        $this->assertSame(ConnectionVerifier::FAILURE_UNREACHABLE, $failure);
        $this->assertSame('unreachable', $verifier->lastFailureDetail());
        $this->assertArrayNotHasKey('verify_target', app('db')->getConnections());
    }
}
