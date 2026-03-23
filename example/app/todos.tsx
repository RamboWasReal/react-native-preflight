import { scenario } from 'react-native-preflight';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useTodoStore } from '../src/stores/todo-store';
import type { Todo } from '../src/stores/todo-store';

export default scenario(
  {
    id: 'todos',
    route: '/todos',
    description: 'Todo list with pre-filled items',
    inject: (overrides) => {
      const items = (overrides?.todos as Todo[]) ?? [
        { id: '1', text: 'Write tests', done: true },
        { id: '2', text: 'Ship feature', done: false },
        { id: '3', text: 'Deploy to prod', done: false },
      ];
      useTodoStore.setState({ todos: items });
    },
    test: ({ tap, see, type }) => [
      see({ id: 'todo-item-1' }),
      see({ id: 'todo-item-2' }),
      see({ id: 'todo-item-3' }),
      see('2 remaining'),
      tap('todo-item-2'),
      see('1 remaining'),
      type('todo-input', 'Record demo'),
      tap('todo-add'),
      see('2 remaining'),
    ],
  },
  function TodoScreen() {
    const { todos, addTodo, toggleTodo } = useTodoStore();
    const [input, setInput] = useState('');

    const handleAdd = () => {
      if (!input.trim()) return;
      addTodo(input.trim());
      setInput('');
    };

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Todos</Text>
        <View style={styles.inputRow}>
          <TextInput
            testID="todo-input"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Add a todo..."
            onSubmitEditing={handleAdd}
          />
          <Pressable testID="todo-add" style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
        <FlatList
          testID="todo-list"
          data={todos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              testID={`todo-item-${item.id}`}
              style={styles.item}
              onPress={() => toggleTodo(item.id)}
            >
              <Text style={[styles.itemText, item.done && styles.done]}>
                {item.done ? '✓ ' : '○ '}
                {item.text}
              </Text>
            </Pressable>
          )}
        />
        <Text testID="todo-count" style={styles.count}>
          {todos.filter((t) => !t.done).length} remaining
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  item: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemText: { fontSize: 16 },
  done: { textDecorationLine: 'line-through', color: '#999' },
  count: { marginTop: 16, fontSize: 14, color: '#666', textAlign: 'center' },
});
