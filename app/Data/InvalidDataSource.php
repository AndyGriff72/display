<?php

namespace App\Data;

use RuntimeException;

/**
 * A data source that cannot be run as it stands, with every reason why.
 */
class InvalidDataSource extends RuntimeException
{
    /** @param list<string> $problems */
    public function __construct(public readonly array $problems)
    {
        parent::__construct(implode(' ', $problems));
    }
}
