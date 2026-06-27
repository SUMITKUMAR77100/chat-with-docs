import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import './App.css';

// ── API helpers ──────────────────────────────────────────────
const API = 'http://localhost:8080';

async function uploadPDF(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

async function* streamChat(question) {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Chat failed');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
}

// ── Upload Zone ──────────────────────────────────────────────
function UploadZone({ onUpload, docInfo }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');

  const onDrop = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const result = await uploadPDF(file);
      onUpload(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="upload-section">
      <h2 className="sidebar-title">💬 Chat With Your Docs</h2>
      <p className="sidebar-subtitle">Week 2 Final Project — RAG + ChromaDB + Groq</p>

      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="upload-status">
            <div className="spinner" />
            <p>Processing PDF...</p>
          </div>
        ) : isDragActive ? (
          <p>Drop your PDF here!</p>
        ) : (
          <div>
            <div className="upload-icon">📂</div>
            <p>Drag & drop a PDF here</p>
            <p className="upload-hint">or click to browse</p>
          </div>
        )}
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

      {docInfo && (
        <div className="doc-info">
          <div className="doc-info-row">
            <span>📄</span>
            <span className="doc-name">{docInfo.filename}</span>
          </div>
          <div className="doc-stats">
            <span>{docInfo.chunks} chunks</span>
            <span>·</span>
            <span>{docInfo.characters.toLocaleString()} chars</span>
          </div>
          <div className="doc-ready">Ready to chat!</div>
        </div>
      )}

      <div className="tips">
        <p className="tips-title">💡 Try asking:</p>
        <p>"What is this document about?"</p>
        <p>"Summarize the key points"</p>
        <p>"What does it say about [topic]?"</p>
      </div>
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────
function Message({ msg }) {
  return (
    <div className={`message ${msg.role}`}>
      <div className="message-avatar">
        {msg.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-bubble">
        {msg.role === 'assistant' ? (
          <ReactMarkdown>{msg.content || '▌'}</ReactMarkdown>
        ) : (
          <p>{msg.content}</p>
        )}
        {msg.streaming && <span className="cursor">▌</span>}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! Upload a PDF on the left and I\'ll answer questions about it using RAG + ChromaDB + Groq. 😊',
    },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [docInfo,  setDocInfo]  = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUpload = (result) => {
    setDocInfo(result);
    setMessages([{
      role: 'assistant',
      content: ` **${result.filename}** uploaded successfully!\n\n` +
               `- **${result.chunks} chunks** indexed in ChromaDB\n` +
               `- **${result.characters.toLocaleString()} characters** extracted\n\n` +
               `Ask me anything about this document!`,
    }]);
  };

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;
    if (!docInfo) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Please upload a PDF first!',
      }]);
      return;
    }

    setInput('');
    setLoading(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: question }]);

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      let fullText = '';
      for await (const chunk of streamChat(question)) {
        fullText += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: fullText,
            streaming: true,
          };
          return updated;
        });
      }
      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: fullText,
          streaming: false,
        };
        return updated;
      });
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ Error: ${e.message}`,
          streaming: false,
        };
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <UploadZone onUpload={handleUpload} docInfo={docInfo} />
      </aside>

      {/* Chat area */}
      <main className="chat-area">
        <div className="messages">
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="input-bar">
          <textarea
            ref={inputRef}
            className="input-field"
            placeholder={docInfo ? "Ask anything about your document..." : "Upload a PDF first..."}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            rows={1}
          />
          <button
            className={`send-btn ${loading ? 'loading' : ''}`}
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            {loading ? <div className="spinner small" /> : '➤'}
          </button>
        </div>
        <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
      </main>
    </div>
  );
}
