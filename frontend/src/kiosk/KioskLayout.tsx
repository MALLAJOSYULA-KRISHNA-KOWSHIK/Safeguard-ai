import { Route, Routes } from 'react-router-dom';
import FaceScanScreen from './FaceScanScreen';
import PPECheckScreen from './PPECheckScreen';
import CheckOutScreen from './CheckOutScreen';

const KioskLayout = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 font-sans">
      <div className="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50">
        <Routes>
          <Route path="/" element={<FaceScanScreen />} />
          <Route path="/ppe" element={<PPECheckScreen />} />
          <Route path="/checkout" element={<CheckOutScreen />} />
        </Routes>
      </div>
    </div>
  );
};

export default KioskLayout;
