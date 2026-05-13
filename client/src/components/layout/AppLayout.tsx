import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ltr:ml-[280px] rtl:mr-[280px] flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-container-padding">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
