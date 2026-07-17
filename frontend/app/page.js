'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Link as LinkIcon, Plus, Search, Brain, X, Loader2, Compass, ArrowRight, Image as ImageIcon, Lock, Laptop, Download, HelpCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import Dropzone from '../components/Dropzone';
import Logo from '../components/Logo';
import CardGrid from '../components/CardGrid';
import ChatSidebar from '../components/ChatSidebar';

import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

const FILTER_TABS = [
  { id: 'all', label: 'All Items', icon: Compass },
  { id: 'screenshots', label: 'Screenshots', icon: ImageIcon },
  { id: 'links', label: 'Links', icon: LinkIcon },
];

export default function Home() {
  const { user, session, loading, signOut } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isScrapingLink, setIsScrapingLink] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  const [isOsSyncEnabled, setIsOsSyncEnabled] = useState(false);
  const [isOsModalOpen, setIsOsModalOpen] = useState(false);
  const [isOsTourOpen, setIsOsTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(1);

  const heroRef = useRef(null);
  const headerRef = useRef(null);

  // Read OS Sync setting and tour triggers on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const enabled = localStorage.getItem('osSyncEnabled') === 'true';
      setIsOsSyncEnabled(enabled);

      const hasSeenTour = localStorage.getItem('hasSeenOSGuide') === 'true';
      if (!hasSeenTour && user) {
        setIsOsTourOpen(true);
      }
    }
  }, [user]);

  const toggleOsSync = (val) => {
    setIsOsSyncEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('osSyncEnabled', val ? 'true' : 'false');
    }
  };

  const markTourAsSeen = () => {
    setIsOsTourOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenOSGuide', 'true');
    }
  };

  const downloadWatcherScript = () => {
    const userEmail = user?.email || 'your_email@example.com';
    const scriptText = `import os
import sys
import time
import requests
import subprocess
from pathlib import Path
from datetime import datetime

# --- CONFIGURATION ---
BACKEND_UPLOAD_URL = "https://patelyug01234--recall-fastapi-app.modal.run/api/upload-file"
SUPABASE_URL = "https://avkwaxjnydfxlnavhiis.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2a3dheGpueWRmeGxuYXZoaWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NDc5NTAsImV4cCI6MjA5OTQyMzk1MH0.R9G3WD64REk1soBuuolPZXn4IAPs3k20wL_FEjz4rFI"

# Pre-filled credentials from your active web session
EMAIL = "${userEmail}"
PASSWORD = "your_password" # REPLACE WITH YOUR PASSWORD

def get_windows_screenshots_dir():
    try:
        import winreg
        subkey = r"Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Explorer\\\\User Shell Folders"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            val, _ = winreg.QueryValueEx(key, "{B7BEDE81-DF94-4682-A7D8-57A52620B86F}")
            resolved_path = os.path.expandvars(val)
            if os.path.exists(resolved_path):
                return resolved_path
    except Exception:
        pass

    user_profile = os.environ.get("USERPROFILE", "")
    onedrive_path = os.path.join(user_profile, "OneDrive", "Pictures", "Screenshots")
    if os.path.exists(onedrive_path):
        return onedrive_path

    return os.path.join(user_profile, "Pictures", "Screenshots")

SCREENSHOTS_DIR = get_windows_screenshots_dir()

token_cache = {
    "access_token": None,
    "expires_at": 0
}

def get_auth_token():
    now = time.time()
    if token_cache["access_token"] and token_cache["expires_at"] > now + 300:
        return token_cache["access_token"]

    print("Authenticating with Supabase...")
    try:
        url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "email": EMAIL,
            "password": PASSWORD
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        token_cache["access_token"] = data["access_token"]
        token_cache["expires_at"] = now + int(data.get("expires_in", 3600))
        print("Authenticated successfully!")
        return token_cache["access_token"]
    except Exception as e:
        print(f"Auth failed: {e}")
        return None

def trigger_notification(title, message):
    ps_command = f"""
    [void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");
    $objNotifyIcon = New-Object System.Windows.Forms.NotifyIcon;
    $objNotifyIcon.Icon = [System.Drawing.SystemIcons]::Information;
    $objNotifyIcon.BalloonTipIcon = "Info";
    $objNotifyIcon.BalloonTipTitle = "{title}";
    $objNotifyIcon.BalloonTipText = "{message}";
    $objNotifyIcon.Visible = $True;
    $objNotifyIcon.ShowBalloonTip(4000);
    """
    try:
        subprocess.run(["powershell", "-Command", ps_command], capture_output=True)
    except Exception as e:
        print(f"Failed to show toast: {e}")

def upload_screenshot(file_path):
    print(f"New screenshot: {file_path}")
    token = get_auth_token()
    if not token:
        print("Skipping upload due to auth failure.")
        trigger_notification("Recall AI: Upload Failed", "Could not authenticate session.")
        return

    print("Uploading to Recall...")
    try:
        headers = {
            "Authorization": f"Bearer {token}"
        }
        with open(file_path, "rb") as f:
            files = {
                "file": (os.path.basename(file_path), f, "image/png")
            }
            resp = requests.post(BACKEND_UPLOAD_URL, headers=headers, files=files, timeout=30)
            
        if resp.status_code == 200:
            data = resp.json()
            title = data.get("metadata", {}).get("title", "Screenshot")
            print(f"Uploaded and indexed: {title}")
            trigger_notification(
                "Recall AI: Screenshot Indexed! 🚀",
                f"Successfully parsed and indexed: {title}"
            )
        else:
            print(f"Upload endpoint failed: {resp.text}")
            trigger_notification("Recall AI: Upload Error", f"Server error: {resp.status_code}")
    except Exception as e:
        print(f"Network error: {e}")
        trigger_notification("Recall AI: Upload Error", "Network or server failure occurred.")

def watch_folder():
    print(f"Watching directory: {SCREENSHOTS_DIR}")
    print("Press Ctrl+C to exit.")
    
    if not os.path.exists(SCREENSHOTS_DIR):
        print(f"Creating path: {SCREENSHOTS_DIR}")
        os.makedirs(SCREENSHOTS_DIR)

    existing_files = set(os.listdir(SCREENSHOTS_DIR))
    get_auth_token()

    while True:
        try:
            time.sleep(1)
            current_files = set(os.listdir(SCREENSHOTS_DIR))
            new_files = current_files - existing_files
            
            for file_name in new_files:
                if file_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    file_path = os.path.join(SCREENSHOTS_DIR, file_name)
                    time.sleep(0.5)
                    upload_screenshot(file_path)
                    
            existing_files = current_files
        except KeyboardInterrupt:
            print("\\nExiting watcher.")
            break
        except Exception as e:
            print(f"Watcher loop error: {e}")
            time.sleep(5)

if __name__ == '__main__':
    if EMAIL == "your_email@example.com" or PASSWORD == "your_password":
        print("ERROR: Please configure your password inside the script first!")
        sys.exit(1)
    watch_folder()
`;
    const blob = new Blob([scriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recall_watcher.py';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Load items from database once session is available
  useEffect(() => {
    if (!session) return;
    const fetchItems = async () => {
      try {
        const response = await fetch('https://patelyug01234--recall-fastapi-app.modal.run/api/items', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          const mapped = data.items.map(item => ({
            id: item.id,
            ocr_text: item.document,
            document: item.document,
            metadata: item.metadata
          }));
          setItems(mapped);
        }
      } catch (err) {
        console.error('Failed to fetch items on mount:', err);
      }
    };
    fetchItems();
  }, [session]);

  // GSAP hero entrance animation
  useEffect(() => {
    if (!headerRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(
      headerRef.current.querySelectorAll('.hero-anim'),
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: 'power3.out' }
    );
  }, []);

  const handleUploadSuccess = (item) => {
    setItems((prevItems) => [item, ...prevItems]);
  };

  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!linkInput.trim() || isScrapingLink || !session) return;
    setIsScrapingLink(true);
    try {
      const tempId = `link-${Date.now()}`;
      const response = await fetch('https://patelyug01234--recall-fastapi-app.modal.run/api/link', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: tempId, url: linkInput }),
      });
      if (!response.ok) throw new Error('Failed to process web link');
      const data = await response.json();
      setItems((prevItems) => [data, ...prevItems]);
      setLinkInput('');
    } catch (err) {
      alert(err.message || 'Failed to index link');
    } finally {
      setIsScrapingLink(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !session) return;
    setIsSearching(true);
    try {
      const response = await fetch('https://patelyug01234--recall-fastapi-app.modal.run/api/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ query: searchQuery, limit: 12 }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const mappedItems = data.results.map(res => ({
            id: res.id,
            ocr_text: res.document,
            document: res.document,
            metadata: res.metadata,
          }));
          setItems(mappedItems);
          setIsSearchMode(true);
        } else {
          setItems([]);
          setIsSearchMode(true);
        }
      }
    } catch (err) {
      console.error('Semantic search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = async () => {
    setSearchQuery('');
    setIsSearchMode(false);
    if (!session) return;
    try {
      const response = await fetch('https://patelyug01234--recall-fastapi-app.modal.run/api/items', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const mapped = data.items.map(item => ({
          id: item.id,
          ocr_text: item.document,
          document: item.document,
          metadata: item.metadata
        }));
        setItems(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch items on clear:', err);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0B0F19',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8892b0',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Logo size={60} />
          <p style={{ fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.1em' }}>LOADING SESSION...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const totalCount = items.length;
  const ssCount = items.filter(i => i.metadata?.type === 'screenshot').length;
  const linkCount = items.filter(i => i.metadata?.type === 'link').length;

  return (
    <main style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      {/* ── Fixed Top Header ──────────────────────────────────────── */}
      <header
        ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          padding: '0 2rem',
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(240,242,248,0.80)',
          backdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.70)',
          boxShadow: '0 2px 20px rgba(108,99,255,0.06)',
        }}
      >
        {/* Gradient bar */}
        <div className="hero-gradient-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />

        {/* Logo */}
        <div className="hero-anim" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Logo size={42} />
          <div>
            <h1 style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 900,
              fontSize: '1.35rem',
              background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 50%, #06B6D4 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1,
            }}>Recall AI</h1>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8892b0', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.1rem' }}>
              Multi-Modal Hub
            </p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="hero-anim" style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Total', count: totalCount, color: '#6C63FF' },
            { label: 'Screenshots', count: ssCount, color: '#8B5CF6' },
            { label: 'Links', count: linkCount, color: '#00A389' },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.70)',
              border: '1px solid rgba(255,255,255,0.90)',
              boxShadow: '2px 2px 6px rgba(200,203,220,0.4), -2px -2px 6px rgba(255,255,255,0.8)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 800, color: stat.color, fontFamily: "'Outfit', sans-serif" }}>
                {stat.count}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#8892b0', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Header Actions */}
        <div className="hero-anim" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <motion.button
            className="btn-primary"
            onClick={() => setIsChatOpen(true)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Brain style={{ width: 16, height: 16 }} />
            <span>Assistant</span>
            <motion.div
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ArrowRight style={{ width: 14, height: 14 }} />
            </motion.div>
          </motion.button>

          <motion.button
            onClick={signOut}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '12px',
              border: '1px solid rgba(220, 53, 69, 0.2)',
              background: 'rgba(255,255,255,0.7)',
              color: '#dc3545',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              boxShadow: '2px 2px 8px rgba(200,203,220,0.3)',
            }}
          >
            <Lock style={{ width: 14, height: 14 }} />
            <span>Sign Out</span>
          </motion.button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2.5rem 2rem 4rem' }}>

        {/* ── Hero Section ─────────────────────────────────────────── */}
        <section style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 1rem',
              borderRadius: '999px',
              background: 'rgba(108,99,255,0.08)',
              border: '1px solid rgba(108,99,255,0.20)',
              marginBottom: '1.25rem',
              boxShadow: '2px 2px 8px rgba(200,203,220,0.3)',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6C63FF', animation: 'pulse-glow 2s infinite' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6C63FF', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.06em' }}>
                POWERED BY MULTI-MODAL VISION ENGINE
              </span>
            </div>

            <h2 style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(2rem, 4vw, 3.2rem)',
              lineHeight: 1.15,
              color: '#1e1b4b',
              marginBottom: '1rem',
            }}>
              Your Personal{' '}
              <span className="gradient-text">Knowledge Hub</span>
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#6b7280',
              fontFamily: "'Inter', sans-serif",
              maxWidth: '520px',
              margin: '0 auto 2rem',
              lineHeight: 1.7,
            }}>
              Drop screenshots, paste links — let the system extract, embed, and make your information{' '}
              <strong style={{ color: '#6C63FF', fontWeight: 700 }}>instantly searchable</strong>.
            </p>
          </motion.div>

          {/* Quick stats bar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{
              display: 'inline-flex',
              gap: '0',
              borderRadius: '18px',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.70)',
              border: '1px solid rgba(255,255,255,0.95)',
              boxShadow: '4px 4px 16px rgba(200,203,220,0.5), -4px -4px 12px rgba(255,255,255,0.9)',
            }}
          >
            {[
              { icon: Brain, label: 'Semantic Search', sub: 'Indexed' },
              { icon: Sparkles, label: 'Text Parser', sub: 'OCR Layer' },
              { icon: Lock, label: 'Private Storage', sub: 'Local Database' },
            ].map((feat, i) => {
              const IconComp = feat.icon;
              return (
                <div key={feat.label} style={{
                  padding: '0.875rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  borderRight: i < 2 ? '1px solid rgba(108,99,255,0.08)' : 'none',
                }}>
                  <div style={{ marginBottom: '0.35rem' }}>
                    <IconComp style={{ width: 18, height: 18, color: '#6C63FF' }} />
                  </div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.75rem', color: '#1e1b4b' }}>{feat.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.62rem', color: '#8892b0' }}>{feat.sub}</div>
                </div>
              );
            })}
          </motion.div>
        </section>

        {/* ── OS Auto-Sync Banner ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{
            background: isOsSyncEnabled 
              ? 'linear-gradient(135deg, rgba(108,99,255,0.09) 0%, rgba(0,201,167,0.06) 100%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(240,240,245,0.7) 100%)',
            border: isOsSyncEnabled ? '2px solid rgba(108,99,255,0.35)' : '1px solid rgba(255,255,255,0.95)',
            boxShadow: isOsSyncEnabled 
              ? '0px 10px 30px rgba(108,99,255,0.12), 0px 4px 10px rgba(0,201,167,0.04)'
              : '5px 5px 15px rgba(200,203,220,0.3)',
            borderRadius: '24px',
            padding: '1.5rem 2rem',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.5rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Left Info side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: isOsSyncEnabled 
                ? 'linear-gradient(135deg, #6C63FF, #00C9A7)'
                : 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isOsSyncEnabled ? '0px 8px 20px rgba(108,99,255,0.25)' : 'none',
            }}>
              <Laptop style={{ width: 22, height: 22, color: isOsSyncEnabled ? 'white' : '#64748b' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1.1rem', color: '#1e1b4b', margin: 0 }}>
                  Windows Screenshot Auto-Sync
                </h3>
                <span style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  fontFamily: "'Outfit', sans-serif",
                  padding: '0.15rem 0.65rem',
                  borderRadius: '999px',
                  background: isOsSyncEnabled ? 'rgba(0,201,167,0.15)' : 'rgba(100,116,139,0.1)',
                  color: isOsSyncEnabled ? '#00A389' : '#64748b',
                  border: isOsSyncEnabled ? '1px solid rgba(0,201,167,0.3)' : '1px solid rgba(100,116,139,0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}>
                  {isOsSyncEnabled && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C9A7', animation: 'pulse-glow 1.5s infinite' }} />}
                  {isOsSyncEnabled ? 'ACTIVE & LISTENING' : 'INACTIVE / SETUP NEEDED'}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', fontFamily: "'Inter', sans-serif", maxWidth: '600px', margin: 0 }}>
                Instantly index your screenshots the exact millisecond you press Win+PrtScn or Snip Tool. Integrates with registry paths automatically.
              </p>
            </div>
          </div>

          {/* Right Controls side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (!isOsSyncEnabled) {
                  setIsOsModalOpen(true);
                } else {
                  toggleOsSync(false);
                }
              }}
              style={{
                padding: '0.75rem 1.75rem',
                borderRadius: '14px',
                border: 'none',
                background: isOsSyncEnabled ? '#ef4444' : 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
                color: 'white',
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: isOsSyncEnabled 
                  ? '0px 4px 12px rgba(239,68,68,0.25)' 
                  : '0px 6px 18px rgba(108,99,255,0.35)',
              }}
            >
              {isOsSyncEnabled ? 'Turn Off Auto-Sync' : 'Configure Auto-Sync'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setTourStep(1);
                setIsOsTourOpen(true);
              }}
              style={{
                width: 38,
                height: 38,
                borderRadius: '12px',
                border: '1px solid rgba(108,99,255,0.2)',
                background: 'rgba(255,255,255,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#6C63FF',
              }}
              title="View Setup Guide"
            >
              <HelpCircle style={{ width: 18, height: 18 }} />
            </motion.button>
          </div>
        </motion.div>

        {/* ── Ingest Panel ─────────────────────────────────────────── */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

            {/* Screenshot Upload */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              style={{
                borderRadius: '24px',
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.90)',
                padding: '1.5rem',
                boxShadow: '5px 5px 16px rgba(200,203,220,0.45), -5px -5px 16px rgba(255,255,255,0.85)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  display: 'flex', alignItems: 'center', justifycontent: 'center',
                  boxShadow: '0 3px 10px rgba(108,99,255,0.30)',
                }}>
                  <Sparkles style={{ width: 13, height: 13, color: 'white' }} />
                </div>
                <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b' }}>
                  Ingest Screenshot
                </h2>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.6rem', fontWeight: 700, color: '#6C63FF',
                  background: 'rgba(108,99,255,0.10)',
                  border: '1px solid rgba(108,99,255,0.20)',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '999px',
                  fontFamily: "'Outfit', sans-serif",
                }}>Text Extraction</span>
              </div>
              <Dropzone onUploadSuccess={handleUploadSuccess} />
            </motion.div>

            {/* Link Ingest + How it works */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              {/* Link Card */}
              <div style={{
                borderRadius: '24px',
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.90)',
                padding: '1.5rem',
                boxShadow: '5px 5px 16px rgba(200,203,220,0.45), -5px -5px 16px rgba(255,255,255,0.85)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '8px',
                    background: 'linear-gradient(135deg, #00C9A7, #00B4D8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(0,201,167,0.25)',
                  }}>
                    <LinkIcon style={{ width: 13, height: 13, color: 'white' }} />
                  </div>
                  <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '0.9rem', color: '#1e1b4b' }}>
                    Ingest Web Link
                  </h2>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.6rem', fontWeight: 700, color: '#00A389',
                    background: 'rgba(0,201,167,0.10)',
                    border: '1px solid rgba(0,201,167,0.25)',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                    fontFamily: "'Outfit', sans-serif",
                  }}>Web Scraper</span>
                </div>

                <form onSubmit={handleAddLink} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="url"
                      required
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="https://example.com/article..."
                      className="input-glass"
                      style={{ paddingLeft: '2.5rem' }}
                      disabled={isScrapingLink}
                    />
                    <LinkIcon style={{ position: 'absolute', left: '0.875rem', width: 15, height: 15, color: '#8892b0', pointerEvents: 'none' }} />
                  </div>
                  <motion.button
                    type="submit"
                    disabled={isScrapingLink}
                    className="btn-teal"
                    whileHover={{ scale: isScrapingLink ? 1 : 1.02 }}
                    whileTap={{ scale: isScrapingLink ? 1 : 0.98 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      opacity: isScrapingLink ? 0.7 : 1,
                    }}
                  >
                    {isScrapingLink ? (
                      <>
                        <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
                        Scraping Content...
                      </>
                    ) : (
                      <>
                        <Plus style={{ width: 15, height: 15 }} />
                        Add Web Link
                      </>
                    )}
                  </motion.button>
                </form>
              </div>

              {/* How it works card */}
              <div style={{
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(108,99,255,0.07) 0%, rgba(0,201,167,0.05) 100%)',
                border: '1px solid rgba(108,99,255,0.15)',
                padding: '1.125rem 1.25rem',
                flex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Compass style={{ width: 16, height: 16, color: '#6C63FF' }} />
                  <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '0.825rem', color: '#1e1b4b' }}>
                    How it works
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {[
                    { step: '1', text: 'Drop screenshot → Vision parser extracts text' },
                    { step: '2', text: 'Paste URL → Scraper fetches web content' },
                    { step: '3', text: 'Text is embedded into ChromaDB vector store' },
                    { step: '4', text: 'Ask Assistant — Semantic search retrieves & answers' },
                  ].map(({ step, text }) => (
                    <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6rem', fontWeight: 800, color: 'white', fontFamily: "'Outfit', sans-serif",
                      }}>{step}</span>
                      <p style={{ fontSize: '0.75rem', color: '#4c5178', fontFamily: "'Inter', sans-serif", lineHeight: 1.45 }}>{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Divider ────────────────────────────────────────────────── */}
        <div className="section-divider" style={{ margin: '0 0 2.5rem' }} />

        {/* ── Search + Filters Row ─────────────────────────────────── */}
        <section style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

            {/* Search Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{ flex: '1', minWidth: '260px', position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Semantic search — describe what you're looking for..."
                className="input-glass"
                style={{ paddingLeft: '2.75rem', paddingRight: isSearchMode ? '6.5rem' : '5rem' }}
              />
              <Search style={{ position: 'absolute', left: '0.9rem', width: 16, height: 16, color: '#8892b0', pointerEvents: 'none' }} />

              {isSearchMode && (
                <button
                  onClick={clearSearch}
                  style={{
                    position: 'absolute',
                    right: '4.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#6C63FF',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <X style={{ width: 12, height: 12 }} /> Clear
                </button>
              )}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSearch}
                disabled={isSearching}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  color: 'white',
                  border: 'none',
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif",
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  boxShadow: '0 2px 10px rgba(108,99,255,0.30)',
                }}
              >
                {isSearching ? (
                  <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                ) : (
                  'Search'
                )}
              </motion.button>
            </motion.div>

            {/* Filter Tabs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              style={{
                display: 'flex',
                gap: '0.25rem',
                padding: '0.35rem',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.70)',
                border: '1px solid rgba(255,255,255,0.95)',
                boxShadow: '3px 3px 10px rgba(200,203,220,0.45), -3px -3px 10px rgba(255,255,255,0.85)',
              }}
            >
              {FILTER_TABS.map(tab => {
                const IconComponent = tab.icon;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={`filter-tab ${filter === tab.id ? 'active' : ''}`}
                    whileHover={{ scale: filter === tab.id ? 1 : 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <IconComponent style={{ width: 14, height: 14 }} />
                    <span>{tab.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          {/* Search mode banner */}
          <AnimatePresence>
            {isSearchMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: '0.875rem',
                  padding: '0.625rem 1rem',
                  borderRadius: '12px',
                  background: 'rgba(108,99,255,0.08)',
                  border: '1px solid rgba(108,99,255,0.20)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                  color: '#6C63FF',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}
              >
                <Sparkles style={{ width: 14, height: 14 }} />
                Showing semantic search results for "<strong>{searchQuery}</strong>"
                <button
                  onClick={clearSearch}
                  style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#6C63FF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 700, fontSize: '0.75rem' }}
                >
                  <X style={{ width: 12, height: 12 }} /> Back to all
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── Cards Grid ───────────────────────────────────────────── */}
        <section>
          <CardGrid items={items} filter={filter} />
        </section>
      </div>

      {/* ── Assistant Sidebar ─────────────────────────────────────── */}
      <ChatSidebar isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* ── OS Configuration explanation Modal ────────────────────── */}
      <AnimatePresence>
        {isOsModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOsModalOpen(false)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
              }}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '540px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '28px',
                padding: '2.25rem',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 50px rgba(108,99,255,0.15)',
                zIndex: 10,
              }}
            >
              <button
                onClick={() => setIsOsModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '1.25rem',
                  right: '1.25rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#a5b4fc',
                  transition: 'background 0.2s',
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Laptop style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1.25rem', color: '#ffffff', margin: 0 }}>
                  Windows Auto-Sync Setup
                </h3>
              </div>

              <p style={{ fontSize: '0.9rem', color: '#9ca3af', fontFamily: "'Inter', sans-serif", lineHeight: 1.6, marginBottom: '1.25rem' }}>
                To bypass browser security limits and upload screenshots in real-time, Recall uses a secure <span style={{ fontWeight: 700, color: '#a5b4fc' }}>local background watcher agent</span>.
              </p>

              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '1.15rem',
                marginBottom: '1.5rem',
              }}>
                <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', margin: '0 0 0.5rem' }}>
                  Features of the Watcher Agent:
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.8rem', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <li>Auto-scans your Windows Screenshots folder or OneDrive location.</li>
                  <li>Queries Windows Registry keys automatically to find custom locations.</li>
                  <li>Uploads securely using your active user session credentials.</li>
                  <li>Displays desktop toast banners on successful upload sync.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    downloadWatcherScript();
                    toggleOsSync(true);
                    setIsOsModalOpen(false);
                  }}
                  style={{
                    padding: '0.9rem 1.5rem',
                    borderRadius: '16px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
                    color: 'white',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 6px 20px rgba(108,99,255,0.3)',
                  }}
                >
                  <Download style={{ width: 16, height: 16 }} />
                  Download Custom Script & Turn On
                </motion.button>

                <button
                  onClick={() => setIsOsModalOpen(false)}
                  style={{
                    padding: '0.8rem 1.5rem',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent',
                    color: '#9ca3af',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.color = '#ffffff'; e.target.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.target.style.color = '#9ca3af'; e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Interactive Setup Tour Modal ─────────────────────────── */}
      <AnimatePresence>
        {isOsTourOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={markTourAsSeen}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(8px)',
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '480px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '28px',
                padding: '2rem 2.25rem',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 50px rgba(108,99,255,0.15)',
                zIndex: 10,
              }}
            >
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem' }}>
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    style={{
                      flex: 1,
                      height: '4px',
                      borderRadius: '999px',
                      background: step <= tourStep ? '#6C63FF' : 'rgba(255,255,255,0.15)',
                      transition: 'background 0.3s ease',
                    }}
                  />
                ))}
              </div>

              {tourStep === 1 && (
                <div>
                  <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1.25rem', color: '#ffffff', margin: '0 0 0.5rem' }}>
                    Welcome to Recall AI 🧠
                  </h4>
                  <p style={{ fontSize: '0.88rem', color: '#9ca3af', fontFamily: "'Inter', sans-serif", lineHeight: 1.6, marginBottom: '1.75rem' }}>
                    Recall AI is your personal multi-modal knowledge hub. It lets you capture, index, and organize your screenshots and web bookmarks so everything is instantly searchable.
                    <br /><br />
                    Powered by a <span style={{ fontWeight: 700, color: '#a5b4fc' }}>multi-modal vision engine</span>, our system automatically extracts text (OCR) and maps context behind the scenes, allowing you to search semantically or chat directly with our AI Assistant to find anything.
                  </p>
                </div>
              )}

              {tourStep === 2 && (
                <div>
                  <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1.25rem', color: '#ffffff', margin: '0 0 0.5rem' }}>
                    Windows Screenshot Auto-Sync ⚡
                  </h4>
                  <p style={{ fontSize: '0.88rem', color: '#9ca3af', fontFamily: "'Inter', sans-serif", lineHeight: 1.6, marginBottom: '1.75rem' }}>
                    Never upload manually again! The Auto-Sync feature instantly matches and uploads your screenshots the exact millisecond they are captured on your Windows PC.
                    <br /><br />
                    A lightweight background script monitors your Windows Screenshots folder or OneDrive location, uploading new captures immediately so they show up on your dashboard.
                    <br /><br />
                    Would you like to enable this feature and show setup instructions?
                  </p>
                </div>
              )}

              {tourStep === 3 && (
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1.5rem' }}>
                  <h4 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1.25rem', color: '#ffffff', margin: '0 0 0.75rem' }}>
                    Auto-Sync Setup Steps ⚙️
                  </h4>

                  {/* Step A */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.9rem', color: '#a5b4fc', marginBottom: '0.25rem' }}>
                      1. Check Python Installation
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                      Open your command prompt or terminal and type <code style={{ color: '#ffffff', background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>python</code>. If it launches Python, you are ready for step 3.
                    </p>
                  </div>

                  {/* Step B */}
                  <div style={{ marginBottom: '1.25rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.9rem', color: '#a5b4fc', marginBottom: '0.35rem' }}>
                      2. If Python is Not Installed (3 Options):
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '0.5rem', lineHeight: 1.45 }}>
                      <li>
                        <strong style={{ color: '#ffffff' }}>Option A (Easiest)</strong>: Type <code style={{ color: '#ffffff', background: 'rgba(255,255,255,0.1)', padding: '0.05rem 0.25rem', borderRadius: '3px' }}>python</code> in command prompt. Windows will auto-open the Microsoft Store. Click "Get/Install".
                      </li>
                      <li>
                        <strong style={{ color: '#ffffff' }}>Option B (Package Manager)</strong>: Run command:
                        <code style={{ display: 'block', background: '#0f172a', padding: '0.35rem 0.5rem', borderRadius: '6px', marginTop: '0.25rem', color: '#38bdf8' }}>
                          winget install -e --id Python.Python.3.12
                        </code>
                      </li>
                      <li>
                        <strong style={{ color: '#ffffff' }}>Option C (PowerShell Silent Installer)</strong>: Run:
                        <code style={{ display: 'block', background: '#0f172a', padding: '0.35rem 0.5rem', borderRadius: '6px', marginTop: '0.25rem', color: '#38bdf8', fontSize: '0.68rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe" -OutFile "python_installer.exe"; Start-Process "python_installer.exe" -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait; Remove-Item "python_installer.exe"
                        </code>
                      </li>
                    </ul>
                  </div>

                  {/* Step C */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.9rem', color: '#a5b4fc', marginBottom: '0.25rem' }}>
                      3. Download & Run Auto-Sync Script
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                      Download the custom script pre-configured with your login email:
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={downloadWatcherScript}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'rgba(108,99,255,0.15)',
                          border: '1px solid rgba(108,99,255,0.3)',
                          color: '#a5b4fc',
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <Download style={{ width: 13, height: 13 }} />
                        Download recall_watcher.py
                      </motion.button>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, marginBottom: '0.5rem' }}>
                      Open your command prompt where you downloaded the script and run:
                    </p>
                    <code style={{
                      display: 'block',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      marginBottom: '0.5rem',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      python recall_watcher.py
                    </code>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                      ⚠️ Note: It will ask for your password once on startup to securely verify and fetch a temporary session key.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {tourStep === 1 && (
                  <>
                    <button
                      onClick={markTourAsSeen}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6b7280',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#9ca3af'}
                      onMouseLeave={(e) => e.target.style.color = '#6b7280'}
                    >
                      Skip guide
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setTourStep(2)}
                      style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: '12px',
                        border: 'none',
                        background: '#6C63FF',
                        color: 'white',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(108,99,255,0.25)',
                      }}
                    >
                      Next Step
                    </motion.button>
                  </>
                )}

                {tourStep === 2 && (
                  <>
                    <button
                      onClick={() => setTourStep(1)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#ffffff'}
                      onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                    >
                      Back
                    </button>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        onClick={markTourAsSeen}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'transparent',
                          color: '#ef4444',
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => { e.target.style.background = 'rgba(239,68,68,0.1)'; }}
                        onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
                      >
                        Don't Enable
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setTourStep(3)}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '12px',
                          border: 'none',
                          background: '#6C63FF',
                          color: 'white',
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(108,99,255,0.25)',
                        }}
                      >
                        Enable Setup Steps
                      </motion.button>
                    </div>
                  </>
                )}

                {tourStep === 3 && (
                  <>
                    <button
                      onClick={() => setTourStep(2)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#ffffff'}
                      onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                    >
                      Back
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        toggleOsSync(true);
                        markTourAsSeen();
                      }}
                      style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #6C63FF, #00C9A7)',
                        color: 'white',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,201,167,0.25)',
                      }}
                    >
                      Finish & Enable Auto-Sync
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
