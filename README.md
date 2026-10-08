# Display Board

A display board made of individual character cells — split-flap, dot matrix or LED
segments — laid out on a grid with static areas for logos, and (soon) fed from a database.

Laravel 12 serves the app and will own database access; the board itself is React +
TypeScript in `resources/js`, built with Vite, set up the same way as Redbrix.

## Setting up a fresh copy

```sh
composer install
npm install
cp .env.example .env
php artisan key:generate
# Key that encrypts saved database passwords (kept separate from APP_KEY):
php -r "echo 'CREDENTIAL_KEY=base64:'.base64_encode(random_bytes(32)).PHP_EOL;" >> .env
php artisan migrate        # creates database/database.sqlite if it is missing
```

## Running it

```sh
composer run dev
```

starts the Laravel server and Vite together. Open <http://localhost:8000>.

## Tests

```sh
npm test            # board, layout and cell logic (Vitest)
npm run typecheck
php artisan test    # server side (PHPUnit)
```
