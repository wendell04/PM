import React, {useState} from 'react';
import LandingPage from './LandingPage';
import CustomerHome from './components/CustomerHome';

function App() {
  const [currentPage, setCurrentPage] = useState('landing');

  if(currentPage === 'home') {
    return <CustomerHome onBackToLanding={() => setCurrentPage('landing')}/>;
  }
  return <LandingPage onEnterShop={() => setCurrentPage('home')}/>;
}

export default App;
