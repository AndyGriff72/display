<?php

namespace App\Connections;

use App\Models\OrganizationConnection;

/**
 * The connection the board's admin has saved. There is only ever one for now.
 */
class SavedConnectionProvider implements ConnectionProvider
{
    public function params(): ?array
    {
        return OrganizationConnection::query()->oldest('id')->first()?->connectionParams();
    }
}
