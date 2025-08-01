import VideoChat from './VideoChat';
import './App.css';
import ErrorBoundary from './ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <VideoChat />
    </ErrorBoundary>
  );
}

export default App;
