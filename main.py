# main.py - Leaf Player Stateless Proxy Backend
# Global State and Synchronization shifted to Firebase Firestore.

from fastapi import FastAPI, HTTPException # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
import cloudinary # type: ignore
import cloudinary.uploader # type: ignore
import os
import json
import urllib.request
import urllib.parse
from dotenv import load_dotenv # type: ignore

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# CLOUDINARY CONFIG
# ----------------------------
cloudinary.config(
    cloud_name=os.getenv("VITE_CLOUDINARY_CLOUD_NAME", os.getenv("CLOUD_NAME")),
    api_key=os.getenv("VITE_CLOUDINARY_API_KEY", os.getenv("API_KEY")),
    api_secret=os.getenv("VITE_CLOUDINARY_API_SECRET", os.getenv("API_SECRET"))
)

# ----------------------------
# ROUTES
# ----------------------------

@app.get("/")
def read_root():
    return {
        "status": "success", 
        "message": "Leaf Player Backend is in Stateless Proxy Mode.",
        "sycn_mode": "Firebase Cloud"
    }

@app.get("/itunes-search")
def itunes_search(q: str):
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=song&limit=5"
        with urllib.request.urlopen(url) as response:
            return json.load(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/itunes-artwork")
def itunes_artwork(q: str):
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=song&limit=1"
        with urllib.request.urlopen(url) as response:
            data = json.load(response)
            if data["resultCount"] > 0:
                artwork_url = data["results"][0]["artworkUrl100"].replace("100x100", "600x600")
                return {"artwork": artwork_url}
        return {"artwork": None}
    except Exception as e:
        return {"artwork": None, "error": str(e)}

# Storage calculation removed as local DB is decommissioned.
# Real-time sync handled by Firebase Client SDK on Frontend.