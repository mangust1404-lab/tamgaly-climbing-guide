import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function InstallPage() {
  const { t } = useI18n()
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('android')
  const [isStandalone, setIsStandalone] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios')
    else if (/Android/i.test(ua)) setPlatform('android')
    else setPlatform('desktop')
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)

    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  if (isStandalone) {
    return (
      <div className="p-4 pt-12 max-w-md mx-auto text-center">
        <p className="text-5xl mb-3">✅</p>
        <h1 className="text-xl font-bold mb-2">{t('install.alreadyInstalled')}</h1>
        <p className="text-sm text-gray-500 mb-4">{t('install.alreadyText')}</p>
        <Link to="/" className="inline-block bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {t('install.openHome')}
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 pt-12 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">📱 {t('install.title')}</h1>
      <p className="text-sm text-gray-600 mb-4">{t('install.intro')}</p>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-4">
        {(['android', 'ios', 'desktop'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium ${
              platform === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {p === 'android' ? '🤖 Android' : p === 'ios' ? '🍎 iPhone' : '💻 ' + t('install.desktop')}
          </button>
        ))}
      </div>

      {/* Big install button if browser supports it */}
      {installPrompt && (
        <button
          onClick={handleInstall}
          className="w-full bg-green-600 text-white rounded-lg py-3 font-medium mb-4 text-sm"
        >
          ⬇️ {t('install.bigButton')}
        </button>
      )}

      {platform === 'android' && (
        <div className="space-y-3">
          <Step n={1} title={t('install.androidStep1Title')}>
            <p>{t('install.androidStep1')}</p>
            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800">
              ⚠️ {t('install.androidTGNote')}
            </div>
          </Step>
          <Step n={2} title={t('install.androidStep2Title')}>
            <p>{t('install.androidStep2a')}</p>
            <div className="mt-2 bg-gray-50 rounded-lg p-2 text-sm font-mono">⋮ → {t('install.androidStep2b')}</div>
          </Step>
          <Step n={3} title={t('install.androidStep3Title')}>
            <p>{t('install.androidStep3')}</p>
          </Step>
          <Step n={4} title={t('install.step4Title')}>
            <p>{t('install.step4')}</p>
          </Step>
        </div>
      )}

      {platform === 'ios' && (
        <div className="space-y-3">
          <Step n={1} title={t('install.iosStep1Title')}>
            <p>{t('install.iosStep1')}</p>
            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800">
              ⚠️ {t('install.iosTGNote')}
            </div>
          </Step>
          <Step n={2} title={t('install.iosStep2Title')}>
            <p>{t('install.iosStep2a')}</p>
            <div className="mt-2 bg-gray-50 rounded-lg p-2 text-sm">⬆️ {t('install.iosStep2b')}</div>
          </Step>
          <Step n={3} title={t('install.iosStep3Title')}>
            <p>{t('install.iosStep3')}</p>
          </Step>
          <Step n={4} title={t('install.step4Title')}>
            <p>{t('install.step4')}</p>
          </Step>
        </div>
      )}

      {platform === 'desktop' && (
        <div className="bg-blue-50 rounded-lg p-3 text-sm">
          <p className="mb-2">{t('install.desktopText')}</p>
          <Link to="/" className="text-blue-600 underline">{t('install.openInBrowser')}</Link>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-500 mb-2">{t('install.askForHelp')}</p>
        <a href="https://t.me/AlexanderLobanov" target="_blank" rel="noreferrer" className="text-xs text-blue-600">
          📱 @AlexanderLobanov
        </a>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-start gap-2 mb-1">
        <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">{n}</span>
        <h3 className="font-semibold text-sm pt-0.5">{title}</h3>
      </div>
      <div className="ml-8 text-sm text-gray-700">{children}</div>
    </div>
  )
}
