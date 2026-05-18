import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';

const MainLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="bt-layout">
      {/* Desktop sidebar */}
      <div className="bt-layout-sidebar" aria-label="侧边栏">
        <Sidebar mobileDrawerOpen={drawerOpen} onMobileDrawerClose={closeDrawer} />
      </div>
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="bt-sidebar-drawer-overlay"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div className="bt-sidebar-drawer" role="dialog" aria-label="导航菜单">
            <Sidebar mobileDrawerOpen={drawerOpen} onMobileDrawerClose={closeDrawer} />
          </div>
        </>
      )}
      <div className="bt-layout-header">
        <Header onMenuClick={openDrawer} />
      </div>
      <main className="bt-layout-content bt-main-bg">
        <Outlet />
      </main>
      <div className="bt-layout-status">
        <StatusBar />
      </div>
    </div>
  );
};

export default MainLayout;
