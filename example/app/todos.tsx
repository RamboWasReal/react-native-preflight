import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native';
import { scenario, testHelpers } from 'react-native-preflight';
import { useTodoStore } from '../src/stores/todo-store';

const { tap, see, type: typeText } = testHelpers;

function TodosScreen() {
  const { todos, addTodo, toggleTodo } = useTodoStore();
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim()) {
      addTodo(input.trim());
      setInput('');
    }
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
        <Pressable testID="add-todo" onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        testID="todo-list"
        data={todos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            testID={`todo-${item.id}`}
            onPress={() => toggleTodo(item.id)}
            style={styles.todoItem}
          >
            <Text style={[styles.todoText, item.done && styles.todoDone]}>
              {item.done ? '\u2611' : '\u2610'} {item.text}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text testID="empty-state" style={styles.empty}>
            No todos yet
          </Text>
        }
      />
    </View>
  );
}

export default scenario(
  {
    id: 'todos',
    route: '/todos',
    description: 'Todo list with add and toggle',
    inject: () => {
      useTodoStore.setState({ todos: [] });
    },
    test: () => [
      see('empty-state'),
      typeText('todo-input', 'Buy milk'),
      tap('add-todo'),
      see({ id: 'todo-list', text: 'Buy milk' }),
    ],
    variants: {
      'with-items': {
        description: 'Pre-populated todo list',
        inject: () => {
          useTodoStore.setState({
            todos: [
              { id: '1', text: 'Buy milk', done: false },
              { id: '2', text: 'Walk the dog', done: true },
              { id: '3', text: 'Write tests', done: false },
            ],
          });
        },
        test: () => [
          see({ id: 'todo-list', text: 'Buy milk' }),
          see({ id: 'todo-list', text: 'Walk the dog' }),
        ],
      },
    },
  },
  TodosScreen,
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  todoItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  todoText: { fontSize: 16 },
  todoDone: { textDecorationLine: 'line-through', color: '#999' },
  empty: { color: '#999', fontSize: 16, textAlign: 'center', marginTop: 32 },
});
