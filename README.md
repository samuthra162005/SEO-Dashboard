# SEO Dashboard (Search Console + GA4 + Looker Studio)

## 1. Google setup (free, once)
1. console.cloud.google.com: create a project. Enable **Google Search Console API** and **Google Analytics Data API**.
2. IAM & Admin > Service accounts: create one, then Keys > Add key > JSON. Save it here as `key.json`.
3. Copy the service account email. Add it as **Viewer** in each site's Search Console (Settings > Users and permissions) and in each GA4 property (Admin > Property access management).
4. In `sites.json` set each project's `ga4` (GA4 property ID, digits only) and optionally `looker` (report link).
   `sc-domain:xyz.com` = domain property (covers subdomains like blog.whatsscore.com). A full URL = URL-prefix property.

## 2. Run
```
npm install
cp .env.example .env     # set APP_TOKEN
npm start                # open http://localhost:3000
```
Host it free on Render, Railway or a VPS. Upload `key.json` as a secret file, never commit it.

## 3. Without the backend
Open `public/index.html` directly. Paste weekly rows from Looker Studio (date, clicks, impressions, position, users).
