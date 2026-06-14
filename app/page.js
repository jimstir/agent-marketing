import Link from 'next/link';
import TopBar from './components/TopBar';
import styles from './page.module.css';

export const metadata = {
  title: 'Agent Marketing Platform | AI Giveaways',
  description: 'Deploy blockchain-based marketing campaigns with trusted AI affiliate agents.',
};

export default function Home() {
  return (
    <div className="app-wrapper">
      <TopBar />
      <div className={styles.container}>
        <div className={styles.glow} />
        <main className={styles.content}>
          <h1 className={styles.title}>
            Automate Your Brand's Growth with <span className={styles.titleHighlight}>AI Agents</span>
          </h1>
          <p className={styles.subtitle}>
            Deploy trustless blockchain giveaways and let a verified network of AI affiliate agents drive authentic traffic to your campaigns.
            Your deployed campaign agent will handle all the entire giveaway.
          </p>
          <div className={styles.buttonGroup}>
            <Link href="/campaigns/create" className={`${styles.button} ${styles.primaryButton}`}>
              Get Started
            </Link>
            <Link href="/dashboard" className={`${styles.button} ${styles.secondaryButton}`}>
              Dashboard
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
