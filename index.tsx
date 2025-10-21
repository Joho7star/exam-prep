import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

declare global {
  interface Window {
    jspdf: { jsPDF: any; };
    marked: any;
  }
}

const { jsPDF } = window.jspdf;
const { marked } = window;

const App = () => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [qaPairs, setQaPairs] = useState([]);
  const [chatTitle, setChatTitle] = useState('Exam Answer Generator');

  const textareaRef = useRef(null);
  const qaListRef = useRef(null);

  // Load chat from localStorage on initial render
  useEffect(() => {
    const savedChat = localStorage.getItem('exam-helper-chat');
    if (savedChat) {
      const { title, qaPairs } = JSON.parse(savedChat);
      setChatTitle(title);
      setQaPairs(qaPairs);
    }
  }, []);

  // Save chat to localStorage whenever it changes
  useEffect(() => {
    if (qaPairs.length > 0) {
      localStorage.setItem('exam-helper-chat', JSON.stringify({ title: chatTitle, qaPairs }));
    } else {
      localStorage.removeItem('exam-helper-chat');
    }
  }, [qaPairs, chatTitle]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [question]);

  useEffect(() => {
    if (qaListRef.current) {
      qaListRef.current.scrollTop = qaListRef.current.scrollHeight;
    }
  }, [qaPairs, isLoading]);

  const handleNewChat = () => {
    if (qaPairs.length > 0 && !window.confirm("Are you sure you want to start a new chat? The current conversation will be cleared.")) {
      return;
    }
    setQaPairs([]);
    setChatTitle('Exam Answer Generator');
    setQuestion('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    const currentQuestion = question.trim();
    setQuestion('');

    const newQaPairs = [...qaPairs, { q: currentQuestion, a: '' }];
    setQaPairs(newQaPairs);

    // Update title if it's the first question
    if (qaPairs.length === 0) {
        const newTitle = currentQuestion.substring(0, 40) + (currentQuestion.length > 40 ? '...' : '');
        setChatTitle(newTitle);
    }

    const systemInstruction = `You are an expert teacher. Generate answers that are exactly what an examiner expects. Be precise, use key terms, and structure answers for full marks based on the assigned marks. For comparisons, use markdown tables. Highlight **important terms**.`;
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: currentQuestion,
        config: { systemInstruction },
      });
      const answer = response.text;
      
      setQaPairs(prevPairs => {
        const updatedPairs = [...prevPairs];
        updatedPairs[updatedPairs.length - 1].a = answer;
        return updatedPairs;
      });
    } catch (error) {
      console.error("Error generating answer:", error);
      setQaPairs(prevPairs => {
        const updatedPairs = [...prevPairs];
        updatedPairs[updatedPairs.length - 1].a = "Sorry, an error occurred. Please try again.";
        return updatedPairs;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePdfExport = () => {
    if (qaPairs.length === 0) return;
  
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  
    const pageMargin = 50;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (pageMargin * 2);
    let yPos = pageMargin;
  
    const addFooter = (pageNumber) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(chatTitle, pageMargin, pageHeight - 20, { align: 'left' });
      doc.text(String(pageNumber), pageWidth - pageMargin, pageHeight - 20, { align: 'right' });
    };

    const renderMarkdown = (text) => {
      const html = marked.parse(text);
      const tempEl = document.createElement('div');
      tempEl.innerHTML = html;
  
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 50);

      const splitText = doc.splitTextToSize(tempEl.innerText, contentWidth);
      const textHeight = splitText.length * 12; 
      
      if (yPos + textHeight > pageHeight - pageMargin) {
        addFooter(doc.internal.getNumberOfPages());
        doc.addPage();
        yPos = pageMargin;
      }

      doc.text(splitText, pageMargin, yPos);
      yPos += textHeight + 10;
    };
  
    yPos = 80;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    const titleLines = doc.splitTextToSize(chatTitle, contentWidth);
    doc.text(titleLines, pageWidth / 2, yPos, { align: 'center' });
    yPos += titleLines.length * 26 + 40;
  
    qaPairs.forEach((qa) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      const qLines = doc.splitTextToSize(qa.q, contentWidth);
      if (yPos + qLines.length * 14 > pageHeight - pageMargin) {
        addFooter(doc.internal.getNumberOfPages());
        doc.addPage();
        yPos = pageMargin;
      }
      doc.text(qLines, pageMargin, yPos);
      yPos += qLines.length * 14 + 15;
  
      renderMarkdown(qa.a);
      yPos += 25;
    });
  
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i);
    }
  
    doc.save(`${chatTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  return (
    <div className="app-container">
      <main className="main-content">
        <header className="content-header">
          <h1>{chatTitle}</h1>
          <div className="header-actions">
             <button className="header-button" onClick={handleNewChat}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
              <span>New Chat</span>
            </button>
            <button className="header-button pdf-button" onClick={handlePdfExport} disabled={qaPairs.length === 0}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
              <span>Export PDF</span>
            </button>
          </div>
        </header>

        {qaPairs.length > 0 ? (
          <div className="qa-list" ref={qaListRef}>
            {qaPairs.map((qa, index) => (
              <div key={index} className="qa-card">
                <div className="question">{qa.q}</div>
                <div className="answer" dangerouslySetInnerHTML={{ __html: marked.parse(qa.a || '') }}></div>
              </div>
            ))}
            {isLoading && (
              <div className="qa-card">
                 <div className="question">{question}</div>
                 <div className="answer">
                  <div className="skeleton skeleton-line"></div>
                  <div className="skeleton skeleton-line" style={{width: '90%'}}></div>
                  <div className="skeleton skeleton-line" style={{width: '75%'}}></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Exam Answer Generator</h2>
            <p>Ask a question below to get started.</p>
          </div>
        )}

        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            placeholder="e.g., Q1 (5 marks): Explain Photosynthesis..."
            rows={1}
          />
          <button type="submit" disabled={isLoading || !question.trim()}>{isLoading ? '...' : 'Ask'}</button>
        </form>
      </main>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
