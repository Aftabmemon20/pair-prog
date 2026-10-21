"use client";

import React, { useState, useRef } from "react";
import { Mic, MicOff, Loader2, Radio } from "lucide-react";
import { useRoomStore } from "../store/roomStore";

interface VoiceButtonProps {
  roomId: string;
  onSpeechTranscribed?: (transcript: string, response?: string) => void;
}

export function VoiceButton({ roomId, onSpeechTranscribed }: VoiceButtonProps) {
  const { currentUser } = useRoomStore();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    if (isRecording || isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioForTranscription(audioBlob);

        // Stop all audio tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      alert("Could not access microphone: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioForTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const formData = new FormData();
      formData.append("file", blob, "voice_input.webm");
      formData.append("actor", currentUser?.name || "Dev A");
      formData.append("ask_agent", "true");

      const res = await fetch(`${apiUrl}/rooms/${roomId}/agent/stt`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (onSpeechTranscribed) {
          onSpeechTranscribed(data.transcript, data.response);
        }
      }
    } catch (err) {
      console.error("STT transcription upload error:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      onClick={toggleRecording}
      disabled={isTranscribing}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border font-medium transition shadow-sm select-none ${
        isRecording
          ? "bg-rose-950/80 border-rose-600 text-rose-200 animate-pulse ring-2 ring-rose-500/30"
          : isTranscribing
          ? "bg-purple-950/40 border-purple-800 text-purple-300 opacity-80"
          : "bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/60 text-slate-300 hover:text-slate-100"
      }`}
      title={
        isRecording
          ? "Click to Stop & Transcribe (Groq Whisper Turbo)"
          : isTranscribing
          ? "Transcribing speech..."
          : "Voice Push-to-Talk (Whisper Turbo STT)"
      }
    >
      {isTranscribing ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          <span className="hidden sm:inline">Transcribing...</span>
        </>
      ) : isRecording ? (
        <>
          <Radio className="w-3.5 h-3.5 text-rose-400 animate-ping" />
          <span className="font-semibold text-rose-300">Listening...</span>
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Voice</span>
        </>
      )}
    </button>
  );
}
