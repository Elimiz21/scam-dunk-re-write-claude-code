# YouTube Data API Setup Guide

To enable real-time tracking of stock promotion videos on YouTube, you need to configure the YouTube Data API.

## Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top left and select **"New Project"**.
3. Name it `ScamDunk-Scanner` (or similar) and click **Create**.

## Step 2: Enable the YouTube Data API v3
1. In the sidebar, go to **APIs & Services > Library**.
2. Search for **"YouTube Data API v3"**.
3. Click on the result and then click **Enable**.

## Step 3: Create an API Key
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials** (top of screen) and select **API Key**.
3. **Copy the API key** shown in the popup.

## Step 4: Configure the Application
1. Open your `.env.local` file in the project root.
2. Add or update the following line:
   ```env
   YOUTUBE_API_KEY=your_copied_api_key_here
   ```
3. Save the file.

## Usage & Quotas
- The free quota is **10,000 units per day**.
- A search query costs **100 units**.
- This allows for roughly **100 searches per day** for free.
- The scanner is optimized to only scan high-risk stocks to stay within this limit.
