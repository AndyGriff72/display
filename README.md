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
php artisan display:admin you@example.com --name="Your Name"   # asks for a password
```

There is no sign-up page: `display:admin` creates the one admin, and run again for an existing
email it sets a new password. Screens (`/screen/{key}`) need no sign-in.

Screens that should make the flap sound unattended need the browser to allow sound without a
tap: set the site's Sound permission to Allow, or start Edge or Chrome with
`--autoplay-policy=no-user-gesture-required` (usual for kiosk set-ups).

On Windows, `scripts/start-screen.ps1` does all of that for a screen machine: it opens the screen
full-screen in its own copy of Edge, with sound allowed and background throttling off, and gives
that copy's processes priority over other programs (AboveNormal unless told otherwise):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-screen.ps1 -Address http://your-server/screen/KEY
```

Add `-Priority High` on a machine that only shows the screen, and `-KeepRaising` to catch
processes Edge starts later, after a reload say. `Get-Help scripts\start-screen.ps1 -Full`
explains each option. Alt+F4 leaves kiosk mode.

To see how a board's split-flaps keep time on a particular machine, add `?timing` to the
address of a screen or the editor (e.g. `/screen/KEY?timing`). A corner readout then shows, for
each of the last few changes: how late the first beat ran, the time the first 12 beats lost
against the beat, the longest gaps between beats and between frames, and how long each beat's
own work took (moving the tiles, and the sound), with averages over every change since the page
opened.

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
