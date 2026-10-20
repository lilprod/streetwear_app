import { Route, Routes } from 'react-router-dom';
import { Home } from './home';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
