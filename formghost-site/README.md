# FormGhost Landing Page

Static landing page for the FormGhost Chrome extension. Designed for deployment to Cloudflare Pages.

## 📁 Files

- `index.html` - Main landing page with hero, features, and how-it-works sections
- `support.html` - FAQ and help documentation
- `privacy.html` - Privacy policy
- `styles.css` - Shared styles (modern ghost/purple theme, mobile responsive)

## 🚀 Deploying to Cloudflare Pages

### Method 1: Via Git (Recommended)

1. **Push to Git repository:**
   ```bash
   git add formghost-site/
   git commit -m "Add FormGhost landing page"
   git push
   ```

2. **Connect to Cloudflare Pages:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to "Workers & Pages" → "Create application" → "Pages"
   - Connect your Git repository
   - Configure build settings:
     - **Build command:** (leave empty - static site)
     - **Build output directory:** `/formghost-site`
     - **Root directory:** `/formghost-site`

3. **Deploy:**
   - Click "Save and Deploy"
   - Your site will be live at `your-project.pages.dev`

### Method 2: Direct Upload

1. **Zip the site files:**
   ```bash
   cd formghost-site
   zip -r ../formghost-site.zip .
   ```

2. **Upload to Cloudflare Pages:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - "Workers & Pages" → "Create application" → "Pages" → "Upload assets"
   - Drag and drop the `formghost-site` folder
   - Deploy

## 🔧 Before Publishing

Update these placeholders:

1. **Chrome Web Store URL:**
   - Replace all `#` links in CTA buttons with actual Chrome Web Store URL
   - Files: `index.html`, footer links in all pages

2. **Support Email:**
   - Current placeholder: `support@formghost.io`
   - Replace with your actual support email
   - Files: All three HTML files

3. **Custom Domain (Optional):**
   - In Cloudflare Pages dashboard, go to "Custom domains"
   - Add your domain (e.g., `formghost.io`)
   - Update DNS settings as instructed

## 🎨 Customization

### Colors

Edit CSS variables in `styles.css`:

```css
:root {
  --ghost-purple: #9333ea;        /* Primary brand color */
  --ghost-purple-light: #a855f7;  /* Hover states */
  --ghost-purple-dark: #7e22ce;   /* Active states */
}
```

### Content

- **Hero headline:** Line 31 in `index.html`
- **Features:** Lines 74-115 in `index.html`
- **FAQs:** Lines 31-136 in `support.html`

## 📱 Mobile Responsive

The site is fully responsive and tested on:
- Desktop (1920px+)
- Tablet (768px - 1024px)
- Mobile (320px - 767px)

## 🔗 Page Structure

```
/                → Landing page (index.html)
/support.html    → FAQ and help
/privacy.html    → Privacy policy
```

## ✅ Checklist

- [ ] Update Chrome Web Store URL
- [ ] Set up support email address
- [ ] Configure custom domain (optional)
- [ ] Test all links before launch
- [ ] Review privacy policy for accuracy
- [ ] Test on mobile devices

## 📊 Performance

- Zero dependencies (no frameworks or libraries)
- Pure HTML/CSS
- Optimized for Cloudflare Pages CDN
- Fast load times (< 1s)

## 🛠️ Local Development

To preview locally:

```bash
cd formghost-site
python3 -m http.server 8000
# Visit http://localhost:8000
```

Or use any static file server of your choice.

---

Built with ❤️ for professionals who value their time and privacy.
