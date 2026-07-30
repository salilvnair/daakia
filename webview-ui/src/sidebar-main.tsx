import React from 'react';
import { createRoot } from 'react-dom/client';
import './sidebar.css';
import { WelcomeSidebar } from './components/sidebar/welcome/WelcomeSidebar';

const root = document.getElementById('sidebar-root')!;
createRoot(root).render(<WelcomeSidebar />);
