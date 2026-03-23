import { create } from 'zustand';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  setTodos: (todos: Todo[]) => void;
}

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  addTodo: (text) =>
    set((s) => ({
      todos: [...s.todos, { id: Date.now().toString(), text, done: false }],
    })),
  toggleTodo: (id) =>
    set((s) => ({
      todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    })),
  setTodos: (todos) => set({ todos }),
}));
