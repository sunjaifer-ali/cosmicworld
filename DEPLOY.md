# Cosmic World — deploy

Shop counter book for Cosmic World Fancy and Cosmetics. GitHub holds the code, Vercel runs it, Neon stores the books.

## 1. Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string. It starts with `postgresql://`.
3. Keep that string private. It is the only database setting the app needs.

## 2. GitHub

1. Create an empty repository.
2. Upload this folder, or push it with git. Do not upload `node_modules`.
3. The shop logo is `public/shop-mark.jpg`. Leave it in place.

## 3. Vercel

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new).
2. Framework preset can stay automatic. This app builds with Vite and Nitro.
3. Add one environment variable, for Production (and Preview if you want it):

   `DATABASE_URL` = the Neon pooled connection string

4. Deploy. The build runs `npm run build`, which applies the SQL files in `migrations/` to Neon. That step is safe to run again.

## 4. First open

1. Open the Vercel URL.
2. The first screen asks you to create the **admin** username and password. Do that once.
3. Staff logins are added later from the Staff tab. Staff do not see profit.
4. Customer bills are not saved into the books.
5. After you have real entries, open Staff and use **Download backup**. Keep that file off the shop phone.

## Local check

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the app uses a local database so you can try it. On Vercel, `DATABASE_URL` must be set or the books will not be the Neon database.
