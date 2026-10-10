# Hosting Owlbear Rodeo

Run the server executable with a data directory on a local disk:

```sh
./owlbear-rodeo --data-dir /srv/owlbear/data --port 9000
```

On Windows, use `owlbear-rodeo.exe` and a local Windows path instead. `--help` lists the options. `--port` defaults to 9000 and can also be set with `PORT`. `--data-dir` can also be set with `DATA_DIR`; the command-line option takes precedence. Without either, the executable uses a `data` directory beside itself. When running from source with `bun src/index.ts`, the default is `data` in the working directory.

## Keep the data on a local disk

Everything the server saves is in the data directory: `owlbear.db` holds accounts, sign-ins, rooms and asset records, and `assets/` holds the image bytes. Keep this directory on a local disk, never a network share. SQLite locking is not safe on a network share. The server also creates `.owlbear-lock.db` to keep a second server from using the same directory.

On startup, the console prints the listening addresses after `Owlbear Rodeo is running at:` and the resolved data directory after `Maps and tokens are kept in`. Check that directory before setting up or restoring a server.

## Back up and restore

1. Stop the server cleanly and wait for it to exit.
2. Copy the whole data directory to your backup location, including hidden files and any SQLite companion files.
3. Start the server again with the same data directory.

A copy taken while the server runs is not promised to be usable. Copying only `owlbear.db` also leaves out the images.

To restore, stop every server using the destination directory. Keep the current directory aside, then replace it with the complete stopped-server backup. Check that the server can read and write it, and start with `--data-dir` pointing to that restored directory. Use an executable that supports the backup's database layout.

## Upgrades and going back

Back up the whole data directory with the server stopped before replacing the executable. At startup, a version that needs to upgrade an older database first saves `owlbear.db.before-upgrade` beside `owlbear.db`, then upgrades automatically. Only one pre-upgrade copy is kept; the next database upgrade replaces it. It contains the database, not a separate copy of `assets/`.

There is no database downgrade. To go back, stop the server and restore your complete pre-upgrade backup, then run the previous executable. If using `owlbear.db.before-upgrade` instead, first keep the current data directory aside, replace `owlbear.db` with that copy, and remove any `owlbear.db-wal` and `owlbear.db-shm` files from the destination so they cannot be replayed onto the restored database. Use the executable matching that copy. Images changed or removed since the upgrade may require the complete backup.

## If startup is refused

The server exits rather than starting empty over an existing database. Paths and version numbers in these messages refer to your directory:

- `Database <path> has newer layout version <version>; this executable supports <version>.` Use a newer executable that supports the database, or stop the server and restore the pre-upgrade copy or your backup before using the previous executable.
- `Cannot read database <path>:` followed by the reason. The message points to `<path>.before-upgrade` if available, or your backup. Keep the damaged directory aside and restore with the server stopped as described above. Do not delete the database to make startup succeed.
- `Cannot use <directory>: another server is using this data directory.` Stop that server, or select a different directory with `--data-dir`. Deleting `.owlbear-lock.db` while a server runs can defeat the protection. A crashed server releases its operating-system lock; the file's presence alone does not mean a server is running.
- `Cannot lock data directory <directory>:` followed by the reason. Check directory permissions and use a local disk, or choose another directory with `--data-dir`.
- `Cannot save the pre-upgrade copy <path>.before-upgrade:` followed by the reason. Check permissions and free disk space before trying again.
- `Unable to upgrade database <path>:` followed by the reason. Stop the server and restore the pre-upgrade copy, or restore your backup and use the previous executable.

## First setup and lost administrator passwords

A new server prints `No administrator exists; setup is required.` Until setup is complete, the server is locked and the browser shows the setup form. The first visitor creates an account that is an administrator. Complete this yourself before giving others access to the server. The console prints `Administrator created: <username>` when the account is created. Later starts print `An administrator exists; setup is closed.`

If every administrator password is lost, stop the server and restart it with the same data directory and `--reopen-setup`:

```sh
./owlbear-rodeo --data-dir /srv/owlbear/data --reopen-setup
```

The console prints `Warning: setup is open; the next visitor can create one new administrator.` Open the server in your browser and create a new administrator account with an unused username. Existing accounts and rooms remain, and sign-in and rooms keep working while setup is open. Setup can create only one new administrator per start. Restrict access while doing this so another visitor cannot take that opportunity. Remove the flag from the next startup command; leaving it in a service command reopens setup on every restart. This flag is command-line only and has no environment variable.

## Home network and internet access

Sign-in works over plain HTTP on a home network, such as `http://<server-address>:9000`. The server itself speaks HTTP.

For a server reachable from the internet, put an HTTPS reverse proxy in front of it and start the server with `--behind-proxy`:

```sh
./owlbear-rodeo --data-dir /srv/owlbear/data --port 9000 --behind-proxy
```

Have the proxy forward HTTP and WebSocket traffic to the server. Restrict direct access to the backend port so requests come through the proxy. The flag trusts the nearest proxy's `X-Forwarded-For` and `X-Forwarded-Proto` values for the client address and protocol. The proxy must append or replace these headers correctly, rather than passing untrusted client values through as the nearest value. Forward the HTTPS protocol so sign-in cookies receive the `Secure` attribute, and the client address so sign-in attempt limits count the right address. Without the flag, forwarded values are ignored. Use the HTTPS address for browser access.
