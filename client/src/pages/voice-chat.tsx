import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mic, MicOff, Volume2, VolumeX, Square, Loader2,
  AudioWaveform, Bot, User, Settings2, Trash2,
} from "lucide-react";

interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

const VOICES = [
  { id: "alloy", label: "Alloy (Neutral)" },
  { id: "echo", label: "Echo (Male)" },
  { id: "fable", label: "Fable (British)" },
  { id: "onyx", label: "Onyx (Deep Male)" },
  { id: "nova", label: "Nova (Female)" },
  { id: "shimmer", label: "Shimmer (Soft Female)" },
];

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const restartingRef = useRef(false);

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
        } else {
          interim += t;
        }
      }
      if (final) setTranscript((prev) => (prev + " " + final).trim());
      setInterimTranscript(interim);
    };

    recognition.onend = () => {
      if (restartingRef.current) {
        restartingRef.current = false;
        return;
      }
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript("");
    setInterimTranscript("");
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {}
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    restartingRef.current = false;
    recognitionRef.current.stop();
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return { isListening, transcript, interimTranscript, isSupported, startListening, stopListening, resetTranscript };
}

export default function VoiceChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("nova");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  const {
    isListening, transcript, interimTranscript, isSupported,
    startListening, stopListening, resetTranscript,
  } = useSpeechRecognition();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, transcript, interimTranscript]);

  const playAudio = useCallback(async (text: string) => {
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
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }
      currentAudioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [selectedVoice]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMsg: VoiceMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    resetTranscript();
    setIsProcessing(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const res = await apiRequest("POST", "/api/voice/chat", {
        message: text.trim(),
        history,
      });
      const data = await res.json();

      const assistantMsg: VoiceMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (autoSpeak) {
        await playAudio(data.text);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [messages, resetTranscript, autoSpeak, playAudio, toast]);

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

  const clearConversation = () => {
    setMessages([]);
    resetTranscript();
    stopAudio();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-3">
          <AudioWaveform className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-voice-chat-title">Voice Chat</h1>
            <p className="text-sm text-muted-foreground">Have a conversation with OpenClaw using your voice</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="w-[180px]" data-testid="select-voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={autoSpeak ? "default" : "outline"}
            size="icon"
            onClick={() => setAutoSpeak(!autoSpeak)}
            title={autoSpeak ? "Auto-speak enabled" : "Auto-speak disabled"}
            data-testid="button-toggle-auto-speak"
          >
            {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={clearConversation}
            disabled={messages.length === 0}
            title="Clear conversation"
            data-testid="button-clear-conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isSupported && (
        <Card className="mb-4 border-destructive bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">
              Speech recognition is not supported in your browser. Please use Chrome or Edge for voice input.
              You can still type messages using the text input below.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0" data-testid="container-messages">
        {messages.length === 0 && !transcript && !interimTranscript && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <AudioWaveform className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Ready to talk</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Press the microphone button and start speaking. OpenClaw will listen, respond, and speak back to you.
            </p>
            <div className="flex items-center gap-4 mt-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5" /> Tap to start
              </div>
              <div className="flex items-center gap-1.5">
                <Square className="h-3.5 w-3.5" /> Tap again to send
              </div>
              <div className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5" /> Auto-speaks reply
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-60">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {msg.role === "assistant" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-60 hover:opacity-100"
                    onClick={() => playAudio(msg.content)}
                    disabled={isSpeaking}
                    data-testid={`button-replay-${msg.id}`}
                  >
                    <Volume2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {(transcript || interimTranscript) && (
          <div className="flex gap-3 justify-end">
            <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-primary/80 text-primary-foreground">
              <p className="text-sm">
                {transcript}
                {interimTranscript && (
                  <span className="opacity-60"> {interimTranscript}</span>
                )}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <Mic className="h-3 w-3 text-red-300 animate-pulse" />
                <span className="text-[10px] opacity-60">Listening...</span>
              </div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4" />
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-muted">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex justify-center">
            <Badge variant="outline" className="animate-pulse gap-1.5" data-testid="badge-speaking">
              <Volume2 className="h-3 w-3" /> Speaking...
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={stopAudio}>
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
            type="text"
            placeholder={isListening ? "Listening... tap mic to send" : "Type a message or tap the mic..."}
            className="w-full rounded-full border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={transcript || ""}
            onChange={(e) => {}}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessing) {
                const input = e.currentTarget;
                if (input.value.trim()) {
                  sendMessage(input.value);
                  input.value = "";
                }
              }
            }}
            disabled={isProcessing || isListening}
            data-testid="input-voice-message"
          />
        </div>

        <Button
          size="lg"
          className={`rounded-full h-14 w-14 shrink-0 transition-all ${
            isListening
              ? "bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/25"
              : isProcessing
              ? "bg-muted"
              : "bg-primary hover:bg-primary/90"
          }`}
          onClick={handleMicToggle}
          disabled={isProcessing || !isSupported}
          data-testid="button-mic-toggle"
        >
          {isProcessing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isListening ? (
            <Square className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </div>
    </div>
  );
}
