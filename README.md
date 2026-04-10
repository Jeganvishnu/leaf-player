# 🍃 Leaf Player

Leaf Player is a high-performance, stateless music player designed for a seamless auditory experience. It combines a sleek, modern React frontend with a lightweight FastAPI proxy and Firebase-powered real-time synchronization.

![Leaf Player Banner](https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=1200&h=400&fit=crop&q=80)

## ✨ Features

- **Real-time Sync**: Library, playlists, and playback state are synchronized across devices via Firebase Firestore.
- **Stateless Magic**: Heavy state is managed in the cloud, keeping the local application lightweight and fast.
- **Intelligent Artwork**: Automatic high-resolution cover art retrieval using the iTunes Search API.
- **Cloudinary Integration**: Secure media storage and transformations for audio and imagery.
- **Bulk Upload**: Effortlessly import your entire music collection in one go.
- **Premium Aesthetics**: Built with Tailwind CSS v4 and Framer Motion for liquid-smooth transitions and a high-end feel.
- **Cross-Platform Playback**: Full Media Session API support for controlling playback from system notifications and lock screens.

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Motion](https://motion.dev/)
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python), [iTunes Search API](https://performance-partners.apple.com/search-api)
- **Database/Real-time**: [Firebase Firestore](https://firebase.google.com/products/firestore)
- **Media Storage**: [Cloudinary](https://cloudinary.com/)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.9+)
- Firebase Project
- Cloudinary Account

### Frontend Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (see `.env.example`).
3. Start the development server:
   ```bash
   npm run dev
   ```

### Backend Setup

1. Install Python dependencies:
   ```bash
   pip install fastapi uvicorn cloudinary python-dotenv
   ```
2. Start the proxy server:
   ```bash
   uvicorn main:app --reload
   ```

## 📄 Environment Variables

Create a `.env` file in the root directory and add the following:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Cloudinary Configuration
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_API_KEY=your_api_key
VITE_CLOUDINARY_API_SECRET=your_api_secret

# Optional: Dedicated Backend Keys (if different)
CLOUD_NAME=your_cloud_name
API_KEY=your_api_key
API_SECRET=your_api_secret
```

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve the sanctuary.

## ⚖️ License

MIT License - feel free to build your own sanctuary.
