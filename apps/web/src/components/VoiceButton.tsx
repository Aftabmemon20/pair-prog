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
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border font-medium transition shadow-sm select-none ${
        isRecording
          ? "bg-rose-100 border-rose-300 text-rose-700 animate-pulse ring-2 ring-rose-400/30"
          : isTranscribing
          ? "bg-indigo-100 border-indigo-200 text-indigo-700 opacity-90"
          : "bg-slate-100 hover:bg-slate-200/80 border-slate-200/70 text-slate-600 hover:text-slate-900"
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
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          <span className="hidden sm:inline font-semibold">Transcribing...</span>
        </>
      ) : isRecording ? (
        <>
          <Radio className="w-3.5 h-3.5 text-rose-600 animate-ping" />
          <span className="font-semibold text-rose-700">Listening...</span>
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5 text-indigo-500" />
          <span className="hidden sm:inline">Voice</span>
        </>
      )}
    </button>
  );
}
