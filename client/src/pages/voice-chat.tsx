import { useState, useRef, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mic, Volume2, VolumeX, Square, Loader2,
  AudioWaveform, Bot, User, Trash2, Send, RotateCcw,
  Keyboard, Download,
} from "lucide-react";

interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  audioBlobUrl?: string;
}

const VOICES = [
  { id: "alloy", label: "Alloy", desc: "Neutral" },
  { id: "echo", label: "Echo", desc: "Male" },
  { id: "fable", label: "Fable", desc: "British" },
  { id: "onyx", label: "Onyx", desc: "Deep" },
  { id: "nova", label: "Nova", desc: "Female" },
  { id: "shimmer", label: "Shimmer", desc: "Soft" },
];

const SILENCE_TIMEOUT_MS = 2000;
const MAX_HISTORY = 20;

function useSpeechRecognition(onSilenceRef: React.MutableRefObject<(() => void) | null>) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFinalRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
          hasFinalRef.current = true;
        } else {
          interim += t;
        }
      }
      if (final) setTranscript((prev) => (prev + " " + final).trim());
      setInterimTranscript(interim);

      clearSilenceTimer();
      if (hasFinalRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          onSilenceRef.current?.();
        }, SILENCE_TIMEOUT_MS);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        setIsListening(false);
      }
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;
    return () => clearSilenceTimer();
  }, [clearSilenceTimer, onSilenceRef]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setTranscript("");
    setInterimTranscript("");
    hasFinalRef.current = false;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {}
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
    setInterimTranscript("");
    clearSilenceTimer();
  }, [clearSilenceTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    hasFinalRef.current = false;
  }, []);

  const setTranscriptManual = useCallback((val: string) => {
    setTranscript(val);
  }, []);

  return {
    isListening, transcript, interimTranscript, isSupported,
    startListening, stopListening, resetTranscript, setTranscriptManual,
  };
}

function WaveformAnimation({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-[3px] bg-red-400 rounded-full animate-pulse"
          style={{
            height: `${8 + Math.random() * 12}px`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${0.4 + Math.random() * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function VoiceChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<VoiceMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem("voice-chat-history");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch {}
    return [];
  });
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem("voice-chat-voice") || "nova");
  const [autoSpeak, setAutoSpeak] = useState(() => localStorage.getItem("voice-chat-autospeak") !== "false");
  const [silenceAutoSend, setSilenceAutoSend] = useState(() => localStorage.getItem("voice-chat-silence-send") !== "false");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const silenceCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    localStorage.setItem("voice-chat-voice", selectedVoice);
  }, [selectedVoice]);
  useEffect(() => {
    localStorage.setItem("voice-chat-autospeak", String(autoSpeak));
  }, [autoSpeak]);
  useEffect(() => {
    localStorage.setItem("voice-chat-silence-send", String(silenceAutoSend));
  }, [silenceAutoSend]);

  useEffect(() => {
    try {
      const toSave = messages.map((m) => ({
        id: m.id, role: m.role, content: m.content, timestamp: m.timestamp.toISOString(),
      }));
      sessionStorage.setItem("voice-chat-history", JSON.stringify(toSave));
    } catch {}
  }, [messages]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const {
    isListening, transcript, interimTranscript, isSupported,
    startListening, stopListening, resetTranscript, setTranscriptManual,
  } = useSpeechRecognition(silenceCallbackRef);

  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, transcript, interimTranscript]);

  const revokeBlobUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    blobUrlsRef.current.delete(url);
  }, []);

  const playAudio = useCallback(async (text: string, messageId?: string) => {
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, voice: selectedVoice }),
      });

      if (!res.ok) {
        const fallback = window.speechSynthesis;
        if (fallback) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);
          fallback.speak(utterance);
          return;
        }
        setIsSpeaking(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.add(url);

      if (messageId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId) {
              if (m.audioBlobUrl) revokeBlobUrl(m.audioBlobUrl);
              return { ...m, audioBlobUrl: url };
            }
            return m;
          })
        );
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [selectedVoice, revokeBlobUrl]);

  const replayAudio = useCallback(async (msg: VoiceMessage) => {
    if (msg.audioBlobUrl) {
      setIsSpeaking(true);
      try {
        const audio = new Audio(msg.audioBlobUrl);
        audioRef.current = audio;
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => {
          setIsSpeaking(false);
          playAudio(msg.content, msg.id);
        };
        await audio.play();
      } catch {
        playAudio(msg.content, msg.id);
      }
    } else {
      playAudio(msg.content, msg.id);
    }
  }, [playAudio]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;

    const userMsg: VoiceMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    resetTranscript();
    setTypedInput("");
    setIsProcessing(true);

    try {
      const history = messagesRef.current.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await apiRequest("POST", "/api/voice/chat", {
        message: text.trim(),
        history,
      });
      const data = await res.json();

      const assistantId = crypto.randomUUID();
      const assistantMsg: VoiceMessage = {
        id: assistantId,
        role: "assistant",
        content: data.text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (autoSpeak) {
        await playAudio(data.text, assistantId);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [resetTranscript, autoSpeak, playAudio, toast]);

  silenceCallbackRef.current = silenceAutoSend ? () => {
    if (transcriptRef.current.trim() && !isProcessingRef.current) {
      stopListening();
      sendMessage(transcriptRef.current);
    }
  } : null;

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) {
        sendMessage(transcript);
      }
    } else {
      stopAudio();
      startListening();
    }
  }, [isListening, transcript, stopListening, startListening, sendMessage, stopAudio]);

  const handleTextSend = useCallback(() => {
    const text = isListening ? transcript : typedInput;
    if (!text.trim()) return;
    if (isListening) stopListening();
    sendMessage(text);
  }, [isListening, transcript, typedInput, stopListening, sendMessage]);

  const clearConversation = useCallback(() => {
    messages.forEach((m) => {
      if (m.audioBlobUrl) revokeBlobUrl(m.audioBlobUrl);
    });
    setMessages([]);
    resetTranscript();
    setTypedInput("");
    stopAudio();
    sessionStorage.removeItem("voice-chat-history");
  }, [messages, revokeBlobUrl, resetTranscript, stopAudio]);

  const exportConversation = () => {
    if (messages.length === 0) return;
    const text = messages
      .map((m) => `[${m.timestamp.toLocaleString()}] ${m.role === "user" ? "You" : "OpenClaw"}: ${m.content}`)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.closest("[role='listbox']")) return;
      if (e.repeat) return;
      if (e.code === "Space" && !isProcessingRef.current && !isListeningRef.current) {
        e.preventDefault();
        stopAudio();
        startListening();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.closest("[role='listbox']")) return;
      if (e.code === "Space" && isListeningRef.current) {
        e.preventDefault();
        stopListening();
        if (transcriptRef.current.trim()) {
          sendMessage(transcriptRef.current);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startListening, stopListening, sendMessage, stopAudio]);

  const inputValue = isListening ? transcript + (interimTranscript ? ` ${interimTranscript}` : "") : typedInput;

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <AudioWaveform className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-voice-chat-title">Voice Chat</h1>
            <p className="text-sm text-muted-foreground">Conversation with OpenClaw — speak or type</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="w-[140px]" data-testid="select-voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="font-medium">{v.label}</span>
                  <span className="text-muted-foreground ml-1 text-xs">({v.desc})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoSpeak ? "default" : "outline"}
                  size="icon"
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  data-testid="button-toggle-auto-speak"
                >
                  {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoSpeak ? "Auto-speak on" : "Auto-speak off"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={silenceAutoSend ? "default" : "outline"}
                  size="icon"
                  onClick={() => setSilenceAutoSend(!silenceAutoSend)}
                  data-testid="button-toggle-silence-send"
                >
                  <Mic className={`h-4 w-4 ${silenceAutoSend ? "" : "opacity-50"}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{silenceAutoSend ? "Auto-send on silence (2s)" : "Manual send only"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={exportConversation}
                  disabled={messages.length === 0}
                  data-testid="button-export-conversation"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearConversation}
                  disabled={messages.length === 0}
                  data-testid="button-clear-conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear conversation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {!isSupported && (
        <Card className="mb-4 border-destructive bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">
              Speech recognition is not supported in your browser. Use Chrome or Edge for voice input, or type your messages below.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 px-1" data-testid="container-messages">
        {messages.length === 0 && !transcript && !interimTranscript && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl scale-150" />
              <AudioWaveform className="h-16 w-16 text-muted-foreground/30 relative" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Ready to talk</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Press the microphone button or hold spacebar to speak. You can also type messages directly.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground max-w-sm">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Mic className="h-3.5 w-3.5 shrink-0" />
                <span>Tap mic to start/stop</span>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Keyboard className="h-3.5 w-3.5 shrink-0" />
                <span>Hold Space to talk</span>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                <span>AI speaks response</span>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Send className="h-3.5 w-3.5 shrink-0" />
                <span>Enter to send text</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`message-${msg.role}-${msg.id}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground mt-1">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] opacity-50">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {msg.role === "assistant" && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-50 hover:opacity-100"
                          onClick={() => replayAudio(msg)}
                          disabled={isSpeaking}
                          data-testid={`button-replay-${msg.id}`}
                        >
                          {msg.audioBlobUrl ? (
                            <Volume2 className="h-3 w-3" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{msg.audioBlobUrl ? "Replay cached audio" : "Generate & play audio"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted mt-1">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isListening && (transcript || interimTranscript) && (
          <div className="flex gap-3 justify-end">
            <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-primary/80 text-primary-foreground">
              <p className="text-sm">
                {transcript}
                {interimTranscript && (
                  <span className="opacity-60"> {interimTranscript}</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <WaveformAnimation isActive />
                <span className="text-[10px] opacity-60">Listening...</span>
                {silenceAutoSend && transcript && (
                  <span className="text-[10px] opacity-40">auto-sends on pause</span>
                )}
              </div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted mt-1">
              <User className="h-4 w-4" />
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground mt-1">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-muted">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground ml-1">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex justify-center">
            <Badge variant="outline" className="animate-pulse gap-1.5 py-1 px-3" data-testid="badge-speaking">
              <WaveformAnimation isActive />
              <span className="text-xs">Speaking</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 hover:bg-destructive/10"
                onClick={stopAudio}
                data-testid="button-stop-speaking"
              >
                <Square className="h-2.5 w-2.5" />
              </Button>
            </Badge>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center gap-3 pt-4 border-t">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            placeholder={isListening ? "Listening... tap mic or release Space to send" : "Type a message or tap the mic..."}
            className="w-full rounded-full border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            value={inputValue}
            onChange={(e) => {
              if (isListening) {
                setTranscriptManual(e.target.value);
              } else {
                setTypedInput(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isProcessing) {
                e.preventDefault();
                handleTextSend();
              }
            }}
            disabled={isProcessing}
            data-testid="input-voice-message"
          />
          {(typedInput.trim() || (isListening && transcript.trim())) && !isProcessing && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-primary hover:text-primary"
              onClick={handleTextSend}
              data-testid="button-send-text"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Button
          size="lg"
          className={`rounded-full h-14 w-14 shrink-0 transition-all duration-200 ${
            isListening
              ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/25"
              : isProcessing
              ? "bg-muted cursor-not-allowed"
              : "bg-primary hover:bg-primary/90 hover:shadow-lg"
          }`}
          onClick={handleMicToggle}
          disabled={isProcessing || !isSupported}
          data-testid="button-mic-toggle"
        >
          {isProcessing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isListening ? (
            <div className="relative">
              <Square className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-white animate-ping" />
            </div>
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </div>

      {isListening && (
        <div className="flex justify-center mt-2">
          <span className="text-xs text-muted-foreground animate-pulse">
            Recording — tap the button or release Space to send
          </span>
        </div>
      )}
    </div>
  );
}
