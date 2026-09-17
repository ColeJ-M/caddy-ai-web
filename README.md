# Caddy AI — setup steps

## 1. Install what you need (one time)
- Install **Node.js** from https://nodejs.org (choose the LTS version). This lets you run the project on your Mac.
- Install **Cursor** from https://cursor.com

## 2. Open the project in Cursor
- Open Cursor, then File → Open Folder, and select this whole `CaddyAI-Web` folder.

## 3. Install dependencies and run it locally
Open Cursor's terminal (Terminal → New Terminal) and run:

```
npm install
npm run dev
```

It'll print a local link like `http://localhost:5173` — open that in your browser to see the app.

Note: the "Get my coaching report" button won't work yet running locally like this,
because `/api/coach` only works once deployed to Vercel (or run with `vercel dev`, see below).

## 4. Push it to GitHub
```
git init
git add .
git commit -m "Caddy AI first version"
```
Then create a new repository on https://github.com/new, and follow the
"push an existing repository" instructions it gives you.

## 5. Deploy on Vercel
- Go to https://vercel.com and sign up (free).
- Click "Add New Project" and import the GitHub repo you just pushed.
- Before deploying, add an Environment Variable:
  - Name: `ANTHROPIC_API_KEY`
  - Value: your real API key from https://console.anthropic.com
- Click Deploy.

Vercel will give you a live URL (like `caddy-ai.vercel.app`) — that's your real,
live, free, working app. The coaching report button will work there since
`/api/coach.js` runs automatically as a Vercel serverless function.

## 6. Making changes later
Any time you want to change something, edit the files in Cursor, then run:
```
git add .
git commit -m "describe what you changed"
git push
```
Vercel automatically redeploys within a minute or two of every push.
