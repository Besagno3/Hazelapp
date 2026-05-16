import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGameStore } from '../../store/gameStore';
import { PASS_THRESHOLD } from '../../lib/utils';
import type { Question, Topic } from '../../types';

// Placeholder questions — swap these out for Supabase queries
const SAMPLE_QUESTIONS: Record<Topic, Question[]> = {
  math: [
    { id: 'm1', topic: 'math', level: 1, text: 'What is 7 × 8?', options: ['54', '56', '64', '49'], correctIndex: 1 },
    { id: 'm2', topic: 'math', level: 1, text: 'What is 144 ÷ 12?', options: ['11', '12', '13', '14'], correctIndex: 1 },
    { id: 'm3', topic: 'math', level: 1, text: 'What is the square root of 81?', options: ['7', '8', '9', '10'], correctIndex: 2 },
    { id: 'm4', topic: 'math', level: 1, text: '15% of 200 is?', options: ['25', '30', '35', '40'], correctIndex: 1 },
    { id: 'm5', topic: 'math', level: 1, text: 'What is 2³?', options: ['6', '8', '16', '9'], correctIndex: 1 },
  ],
  science: [
    { id: 's1', topic: 'science', level: 1, text: 'What gas do plants absorb?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Helium'], correctIndex: 2 },
    { id: 's2', topic: 'science', level: 1, text: 'How many bones in the adult body?', options: ['196', '206', '216', '226'], correctIndex: 1 },
    { id: 's3', topic: 'science', level: 1, text: 'What planet is closest to the sun?', options: ['Venus', 'Earth', 'Mercury', 'Mars'], correctIndex: 2 },
    { id: 's4', topic: 'science', level: 1, text: 'What is H₂O?', options: ['Hydrogen', 'Helium', 'Water', 'Salt'], correctIndex: 2 },
    { id: 's5', topic: 'science', level: 1, text: 'Speed of light is approximately?', options: ['300km/s', '3000km/s', '300,000km/s', '30km/s'], correctIndex: 2 },
  ],
  engineering: [
    { id: 'e1', topic: 'engineering', level: 1, text: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Power Unit', 'Core Process Unit', 'Central Power Unit'], correctIndex: 0 },
    { id: 'e2', topic: 'engineering', level: 1, text: 'Which material is strongest?', options: ['Iron', 'Aluminum', 'Steel', 'Copper'], correctIndex: 2 },
    { id: 'e3', topic: 'engineering', level: 1, text: 'What does a resistor do?', options: ['Store charge', 'Resist current flow', 'Amplify signals', 'Convert AC to DC'], correctIndex: 1 },
    { id: 'e4', topic: 'engineering', level: 1, text: 'What is 1 byte equal to?', options: ['4 bits', '6 bits', '8 bits', '16 bits'], correctIndex: 2 },
    { id: 'e5', topic: 'engineering', level: 1, text: 'What shape is strongest in construction?', options: ['Square', 'Circle', 'Triangle', 'Rectangle'], correctIndex: 2 },
  ],
  creativity: [
    { id: 'c1', topic: 'creativity', level: 1, text: 'Red + Blue = ?', options: ['Green', 'Purple', 'Orange', 'Brown'], correctIndex: 1 },
    { id: 'c2', topic: 'creativity', level: 1, text: 'How many notes in a musical scale?', options: ['5', '6', '7', '8'], correctIndex: 2 },
    { id: 'c3', topic: 'creativity', level: 1, text: 'Who painted the Mona Lisa?', options: ['Picasso', 'Da Vinci', 'Monet', 'Van Gogh'], correctIndex: 1 },
    { id: 'c4', topic: 'creativity', level: 1, text: 'What are the primary colors?', options: ['Red/Blue/Green', 'Red/Yellow/Blue', 'Red/Green/Yellow', 'Blue/Green/Orange'], correctIndex: 1 },
    { id: 'c5', topic: 'creativity', level: 1, text: 'A haiku has how many syllables total?', options: ['14', '17', '21', '10'], correctIndex: 1 },
  ],
};

const QUESTIONS_PER_ROUND = 5;

export default function QuizRound() {
  const { progress, completeRound, setPhase } = useGameStore();
  const topic = progress.currentTopic!;
  const questions = SAMPLE_QUESTIONS[topic].slice(0, QUESTIONS_PER_ROUND);

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  const q = questions[current];
  const score = answers.filter(Boolean).length / QUESTIONS_PER_ROUND;
  const passed = score >= PASS_THRESHOLD;

  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === q.correctIndex;
    const newAnswers = [...answers, correct];

    setTimeout(() => {
      if (current + 1 < questions.length) {
        setCurrent((c) => c + 1);
        setSelected(null);
        setAnswers(newAnswers);
      } else {
        setAnswers(newAnswers);
        const finalScore = newAnswers.filter(Boolean).length / QUESTIONS_PER_ROUND;
        if (finalScore >= PASS_THRESHOLD) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
        setDone(true);
        completeRound({ topic, questions, score: finalScore, passed: finalScore >= PASS_THRESHOLD });
      }
    }, 800);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm w-full"
        >
          <div className="text-6xl mb-4">{passed ? '🏆' : '😅'}</div>
          <h2 className="text-2xl font-bold mb-2">{passed ? 'Round Passed!' : 'Keep Trying!'}</h2>
          <p className="text-gray-500 mb-6">Score: {Math.round(score * 100)}%</p>
          <button
            onClick={() => setPhase('topic-select')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-2 transition"
          >
            Back to Topics
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <div className="flex justify-between text-sm text-gray-400 mb-4">
          <span className="capitalize font-medium text-purple-600">{topic}</span>
          <span>Question {current + 1}/{QUESTIONS_PER_ROUND}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
          >
            <h2 className="text-xl font-semibold mb-6">{q.text}</h2>
            <div className="space-y-3">
              {q.options.map((opt, idx) => {
                let cls = 'w-full text-left border-2 rounded-lg px-4 py-3 transition font-medium ';
                if (selected === null) cls += 'border-gray-200 hover:border-purple-400';
                else if (idx === q.correctIndex) cls += 'border-green-500 bg-green-50 text-green-700';
                else if (idx === selected) cls += 'border-red-400 bg-red-50 text-red-600';
                else cls += 'border-gray-200 opacity-50';

                return (
                  <button key={idx} onClick={() => handleAnswer(idx)} className={cls}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
