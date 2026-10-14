import AIPromptPage from './pages/ai-prompt';
import { DeviceGuard } from './components/DeviceGuard';

function App() {
  return (
    <DeviceGuard>
      <AIPromptPage />
    </DeviceGuard>
  );
}

export default App;

