#include "dsoftwindowsprinterdispatcher.h"

#include "jpeg.hpp"
#include "windowsprinter.h"

#include <QMutexLocker>

#include <algorithm>

DSoftWindowsPrinterDispatcher::DSoftWindowsPrinterDispatcher()
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32)
    : spooler_(std::make_unique<PrinterWindowsSpooler>())
#endif
{
}

DSoftWindowsPrinterDispatcher::~DSoftWindowsPrinterDispatcher() = default;

QStringList DSoftWindowsPrinterDispatcher::installedPrinters() const {
  QStringList result;
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32)
  for (const auto &name : PrinterWindowsSpooler::enumeratePrinters())
    result.append(QString::fromLocal8Bit(name.c_str()));
#endif
  result.removeDuplicates();
  result.sort(Qt::CaseInsensitive);
  return result;
}

bool DSoftWindowsPrinterDispatcher::printerExists(
    const QString &windowsPrinterName) const {
  const QString requested = windowsPrinterName.trimmed();
  if (requested.isEmpty())
    return false;
  const auto printers = installedPrinters();
  return std::any_of(printers.cbegin(), printers.cend(),
                     [&requested](const QString &name) {
                       return name.compare(requested, Qt::CaseInsensitive) == 0;
                     });
}

bool DSoftWindowsPrinterDispatcher::printerReady(
    const QString &windowsPrinterName, QString *errorMessage) const {
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32)
  QMutexLocker locker(&mutex_);
  if (!spooler_) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Windows spooler is unavailable.");
    return false;
  }
  if (!printerExists(windowsPrinterName)) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Configured Windows printer was not found.");
    return false;
  }
  spooler_->setString("name", windowsPrinterName.toLocal8Bit().constData());
  const bool ready = spooler_->updateAndGetStatus() == CONNECTED;
  if (!ready && errorMessage)
    *errorMessage = QStringLiteral("Windows reports the printer as offline.");
  return ready;
#else
  Q_UNUSED(windowsPrinterName)
  if (errorMessage)
    *errorMessage = QStringLiteral("Windows printing is not available on this platform.");
  return false;
#endif
}

bool DSoftWindowsPrinterDispatcher::dispatch(const PrinterProfile &profile,
                                             const DSoftPrintJob &job,
                                             QString *errorMessage) {
  if (!profile.isValid()) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Printer profile is invalid.");
    return false;
  }
  if (!job.isValid()) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Print job is invalid.");
    return false;
  }

  QMutexLocker locker(&mutex_);
  if (!spooler_) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Windows spooler is unavailable.");
    return false;
  }

  spooler_->setString("name",
                      profile.windowsPrinterName.toLocal8Bit().constData());
  spooler_->setString("protocol_type", "escpos");
  spooler_->setInt("max_width", profile.paperWidthMm <= 58 ? 384 : 576);
  // Keep the existing ESC/POS gamma: black remains solid while anti-aliased
  // edges are darkened before the 1-bit raster conversion.
  spooler_->setInt("gamma", 240);
  spooler_->setInt("lines_to_feed", 4);
  spooler_->setInt("paper_cut", 1);
  spooler_->setInt("cash_drawer", profile.cashDrawerEnabled ? 1 : 0);

  if (spooler_->updateAndGetStatus() != CONNECTED) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Target Windows printer is offline or unavailable.");
    return false;
  }

  return job.type == DSoftPrintJobType::CashDrawer
             ? dispatchCashDrawer(profile, errorMessage)
             : dispatchReceipt(profile, job, errorMessage);
}

bool DSoftWindowsPrinterDispatcher::dispatchReceipt(
    const PrinterProfile &, const DSoftPrintJob &job, QString *errorMessage) {
  jpeg image;
  const std::string payload(job.payload.constData(),
                            static_cast<std::size_t>(job.payload.size()));
  if (!image.decode(payload)) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Receipt JPEG payload could not be decoded.");
    return false;
  }
  const bool submitted = spooler_->printJPEG(image);
  if (!submitted && errorMessage)
    *errorMessage = QStringLiteral("Windows spooler rejected the receipt job.");
  return submitted;
}

bool DSoftWindowsPrinterDispatcher::dispatchCashDrawer(
    const PrinterProfile &profile, QString *errorMessage) {
  if (!profile.cashDrawerEnabled) {
    if (errorMessage)
      *errorMessage = QStringLiteral("Cash drawer is disabled for this printer profile.");
    return false;
  }

  // ESC/POS: ESC p m t1 t2. Use pin 2 with a short pulse.
  const std::string command("\x1B\x70\x00\x19\xFA", 5);
  const bool submitted = spooler_->send_raw(command);
  if (!submitted && errorMessage)
    *errorMessage = QStringLiteral("Cash drawer command failed.");
  return submitted;
}
