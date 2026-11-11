import { useCallback, useEffect, useRef, useState } from "react";
import "./styles/theme.css";
import "./styles/compat.css";
import "./styles/oncology.css";
import "./styles/motion.css";
import "./styles/calendar.css";
import "./styles/game.css";

import useTheme from "./hooks/useTheme";
import {
  addQuestionApi,
  createAppointmentApi,
  createClinicalOrder,
  createTaskApi,
  deleteQuestionApi,
  deleteTaskApi,
  fetchWorkspace,
  getAuthToken,
  logMoodApi,
  logPatientIntake,
  logSymptomApi,
  logVitalsApi,
  logoutFromServer,
  patchPatientPathology,
  recomputePatientRisk,
  registerAccount,
  saveInfusionPrepApi,
  saveTrackerApi,
  setAuthToken,
  toggleClinicalOrder,
  toggleTaskApi,
  updateAppointmentStatusApi,
  updateHospitalConfig,
  updatePatientLabs,
  updateSignOff,
  updateTumorBoard,
} from "./utils/api";

import ToastProvider, { useToast } from "./components/ToastProvider";
import PublicHeader from "./components/PublicHeader";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import NurseDashboard from "./pages/nurse/NurseDashboard";
import PatientPortal from "./pages/patient/PatientPortal";

function AppContent() {
  const { theme, toggle } = useTheme();
  const toast = useToast();

  const [view, setView] = useState("landing");
  const [loginRole, setLoginRole] = useState("doctor");
  const [bootstrapping, setBootstrapping] = useState(Boolean(getAuthToken()));

  const [session, setSession] = useState(null);
  const [hospitalConfig, setHospitalConfig] = useState({
    hospitalName: "National Cancer Care Hospital",
    daycareName: "Daycare Oncology Unit",
    daycarePhone: "",
  });
  const [glossary, setGlossary] = useState({});
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [symptomLogs, setSymptomLogs] = useState([]);
  const [infusionPrep, setInfusionPrep] = useState({});
  const prepRef = useRef({});
  const prepSeqRef = useRef({});
  const [tracker, setTracker] = useState({});
  const [companionHistory, setCompanionHistory] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);

  const hydrateWorkspace = useCallback(async () => {
    const ws = await fetchWorkspace();
    setSession(ws.user);
    setHospitalConfig(ws.config || { hospitalName: "National Cancer Care Hospital", daycareName: "Daycare Oncology Unit", daycarePhone: "" });
    setGlossary(ws.glossary || {});
    setDoctors(ws.doctors || []);
    setPatients(ws.patients || []);
    setAppointments(ws.appointments || []);
    setTasks(ws.tasks || []);
    setSymptomLogs(ws.symptomLogs || []);
    prepRef.current = ws.infusionPrep || {};
    setInfusionPrep(ws.infusionPrep || {});
    setTracker(ws.tracker || {});
    setCompanionHistory(ws.companionHistory || []);
    setView("portal");
  }, []);

  useEffect(() => {
    if (!getAuthToken()) return;
    hydrateWorkspace()
      .catch(() => {
        setAuthToken("");
        setSession(null);
        setView("landing");
      })
      .finally(() => setBootstrapping(false));
  }, [hydrateWorkspace]);

  const replacePatient = useCallback((updated) => {
    if (!updated) return;
    setPatients((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleSaveConfig = async (patch) => {
    const cfg = await updateHospitalConfig(patch);
    setHospitalConfig(cfg);
    return cfg;
  };

  const handleLogIntake = async (patientId, payload) => {
    const res = await logPatientIntake(patientId, payload);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleRegisterAccount = async (payload) => {
    const result = await registerAccount(payload);
    await hydrateWorkspace();
    return result;
  };

  const handleEditPathology = async (patientId, field, value) => {
    const res = await patchPatientPathology(patientId, field, value);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleRecomputeRisk = async (patientId) => {
    const res = await recomputePatientRisk(patientId);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleTumorBoard = async (patientId, payload) => {
    const res = await updateTumorBoard(patientId, payload);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleSignOff = async (patientId, payload) => {
    const res = await updateSignOff(patientId, payload);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleUpdateLabs = async (patientId, payload) => {
    const res = await updatePatientLabs(patientId, payload);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleAddOrder = async (patientId, orderText) => {
    const res = await createClinicalOrder(patientId, orderText);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleToggleOrder = async (orderId) => {
    const res = await toggleClinicalOrder(orderId);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleCreateAppointment = async (payload) => {
    const res = await createAppointmentApi(payload);
    setAppointments((list) => [...list, res.appointment]);
    return res.appointment;
  };

  const setAppointmentStatus = async (appointmentId, status) => {
    try {
      const res = await updateAppointmentStatusApi(appointmentId, status);
      setAppointments((list) => list.map((a) => (a.id === appointmentId ? res.appointment : a)));
      return res.appointment;
    } catch (err) {
      toast(err.message || "Failed to update appointment");
      throw err;
    }
  };

  const setPrep = async (appointmentId, patch) => {
    const prev = { bay: "", anc: "", lvef: false, vitals: false, ...(prepRef.current[appointmentId] || {}) };
    const next = { ...prev, ...patch };
    const seq = (prepSeqRef.current[appointmentId] || 0) + 1;
    prepSeqRef.current[appointmentId] = seq;
    prepRef.current = { ...prepRef.current, [appointmentId]: next };
    setInfusionPrep((map) => ({ ...map, [appointmentId]: next }));
    try {
      const res = await saveInfusionPrepApi(appointmentId, next);
      if (prepSeqRef.current[appointmentId] === seq) {
        prepRef.current = { ...prepRef.current, [appointmentId]: res.prep };
        setInfusionPrep((map) => ({ ...map, [appointmentId]: res.prep }));
      }
      return res.prep;
    } catch (err) {
      if (prepSeqRef.current[appointmentId] === seq) {
        prepRef.current = { ...prepRef.current, [appointmentId]: prev };
        setInfusionPrep((map) => ({ ...map, [appointmentId]: prev }));
      }
      toast(err.message || "Failed to save infusion prep");
      throw err;
    }
  };

  const addTask = async (task) => {
    const res = await createTaskApi(task);
    setTasks((list) => [...list, res.task]);
    return res.task;
  };

  const toggleTask = async (taskId) => {
    const res = await toggleTaskApi(taskId);
    setTasks((list) => list.map((t) => (t.id === taskId ? res.task : t)));
    return res.task;
  };

  const deleteTask = async (taskId) => {
    await deleteTaskApi(taskId);
    setTasks((list) => list.filter((t) => t.id !== taskId));
  };

  const addSymptomLog = async (entry) => {
    const pid = entry.patientId || session?.patientId || session?.id;
    const res = await logSymptomApi(pid, entry);
    setSymptomLogs((list) => [res.symptomLog, ...list]);
    return res.symptomLog;
  };

  const handleLogVitals = async (patientId, payload) => {
    const res = await logVitalsApi(patientId, payload);
    replacePatient(res.patient);
    if (res.urgentSymptomLog) {
      setSymptomLogs((list) => [res.urgentSymptomLog, ...list]);
    }
    return res;
  };

  const handleLogMood = async (patientId, date, moodId) => {
    const res = await logMoodApi(patientId, date, moodId);
    setPatients((list) => list.map((p) => (p.id === patientId ? { ...p, moods: res.moods } : p)));
    return res.moods;
  };

  const handleAddQuestion = async (patientId, text) => {
    const res = await addQuestionApi(patientId, text);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleDeleteQuestion = async (patientId, qId) => {
    const res = await deleteQuestionApi(patientId, qId);
    replacePatient(res.patient);
    return res.patient;
  };

  const handleSaveTracker = async (patientId, nextState) => {
    setTracker(nextState);
    try {
      await saveTrackerApi(patientId, nextState);
    } catch (err) {
      toast(err.message || "Failed to save treatment log");
    }
  };

  const handleAppendUrgentSymptom = useCallback((urgentLog) => {
    if (urgentLog) {
      setSymptomLogs((list) => [urgentLog, ...list]);
    }
  }, []);

  const goToLogin = (role) => {
    setLoginRole(role);
    setView("login");
  };

  const handleLogin = async () => {
    await hydrateWorkspace();
  };

  const handleLogout = async () => {
    await logoutFromServer();
    setAuthToken("");
    setSession(null);
    setPatients([]);
    setAppointments([]);
    setTasks([]);
    setSymptomLogs([]);
    setInfusionPrep({});
    setActiveReportId(null);
    setView("landing");
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  if (bootstrapping) {
    return (
      <div className="max-w-xl mx-auto px-5 py-16 text-center">
        <p className="text-muted">Loading clinical workspace...</p>
      </div>
    );
  }

  if (view === "portal" && session) {
    const common = {
      theme,
      onToggleTheme: toggle,
      onLogout: handleLogout,
      hospitalConfig,
      onSaveConfig: handleSaveConfig,
    };

    const taskProps = {
      tasks,
      onAddTask: addTask,
      onToggleTask: toggleTask,
      onDeleteTask: deleteTask,
      symptomLogs,
      onLogSymptom: addSymptomLog,
      prep: infusionPrep,
      onSetPrep: setPrep,
    };

    let dashboard;

    if (session.role === "doctor") {
      dashboard = (
        <DoctorDashboard
          doctor={doctors.find((d) => d.id === session.id) || session}
          doctors={doctors}
          patients={patients}
          appointments={appointments}
          activeReportId={activeReportId}
          onReportIdChange={setActiveReportId}
          onRefreshWorkspace={hydrateWorkspace}
          onEditPathology={handleEditPathology}
          onRecomputeRisk={handleRecomputeRisk}
          onTumorBoard={handleTumorBoard}
          onSignOff={handleSignOff}
          onUpdateLabs={handleUpdateLabs}
          onAddOrder={handleAddOrder}
          onToggleOrder={handleToggleOrder}
          {...taskProps}
          {...common}
        />
      );
    } else if (session.role === "nurse") {
      dashboard = (
        <NurseDashboard
          nurse={session}
          doctors={doctors}
          patients={patients}
          appointments={appointments}
          setAppointmentStatus={setAppointmentStatus}
          onCreateAppointment={handleCreateAppointment}
          onLogIntake={handleLogIntake}
          onRegisterAccount={handleRegisterAccount}
          onReportUploaded={(res) => {
            if (res?.report_id !== undefined) setActiveReportId(res.report_id);
          }}
          onRefreshWorkspace={hydrateWorkspace}
          {...taskProps}
          {...common}
        />
      );
    } else {
      const currentPatient = patients.find((p) => p.id === (session.patientId || session.id)) || patients[0];
      dashboard = (
        <PatientPortal
          user={session}
          patient={currentPatient}
          doctors={doctors}
          glossary={glossary}
          appointments={appointments}
          activeReportId={activeReportId}
          trackerState={tracker}
          onSaveTracker={handleSaveTracker}
          initialCompanionHistory={companionHistory}
          onAppendUrgentSymptom={handleAppendUrgentSymptom}
          onLogVitals={handleLogVitals}
          onLogMood={handleLogMood}
          onAddQuestion={handleAddQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          {...taskProps}
          {...common}
        />
      );
    }

    return (
      <div key={`${session.role}-${session.id}`} className="screen-transition portal-transition">
        {dashboard}
      </div>
    );
  }

  return (
    <div key={view} className="screen-transition public-transition">
      <PublicHeader
        theme={theme}
        onToggleTheme={toggle}
        onHome={() => setView("landing")}
        onSignIn={() => goToLogin("doctor")}
        showSignIn={view === "landing"}
      />

      {view === "landing" ? (
        <LandingPage onSignIn={goToLogin} />
      ) : (
        <LoginPage
          initialRole={loginRole}
          onBack={() => setView("landing")}
          onSuccess={handleLogin}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
