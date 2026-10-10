import { useState, useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import { useMapLoading } from "../contexts/MapLoadingContext";
import { useParty } from "../contexts/PartyContext";
import { useAssets } from "../contexts/AssetsContext";

import Session from "../network/Session";
import {
  AssetRequestError,
  downloadAsset,
  hasAsset,
  uploadAsset,
} from "../network/assetStore";

import { AssetManifest, AssetManifestAsset } from "../types/Asset";

// Where an asset in the manifest is at in being sent to or loaded from the server
type AssetTransfer = {
  isBusy: boolean;
  done: boolean;
  // Failed attempts since the last success
  failures: number;
  // Time before which the transfer shouldn't be tried again
  retryAt: number;
  warned: boolean;
};

// Failed transfers are retried after 2s, 4s, 8s and so on up to this
const MAX_RETRY_DELAY = 30000;

function getErrorStatus(error: unknown) {
  return error instanceof AssetRequestError ? error.status : undefined;
}

/**
 * Keep the assets of a manifest in step with the server: send the ones we own
 * and load everyone else's
 *
 * @param loadOnly Never send assets and stay quiet about failures, as a cast display does
 */
function useAssetTransfers(
  session: Session,
  assetManifest: AssetManifest | null,
  userId: string | undefined,
  loadOnly = false,
  allowUploads = true
) {
  const { addToast } = useToasts();
  const allowUploadsRef = useRef(allowUploads);
  allowUploadsRef.current = allowUploads;
  const partyState = useParty();
  const { assetLoadStart, assetProgressUpdate, assetLoadCancel } =
    useMapLoading();
  const { getAsset, putAsset } = useAssets();

  // Join tokens come and go with the connection to the server
  const [joinToken, setJoinToken] = useState(session.joinToken);
  useEffect(() => {
    function handleStatus() {
      setJoinToken(session.joinToken);
    }
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  // Keep track of where each asset is at to prevent sending or loading them multiple times
  const assetTransfersRef = useRef<Record<string, AssetTransfer>>({});
  // Changed when a failed transfer is ready to be tried again
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const retryTimeouts = retryTimeoutsRef.current;
    return () => {
      for (let timeout of retryTimeouts) {
        clearTimeout(timeout);
      }
      retryTimeouts.clear();
    };
  }, []);

  const partyStateRef = useRef(partyState);
  useEffect(() => {
    partyStateRef.current = partyState;
  });

  // Send the assets we own to the server and load everyone else's from it
  useEffect(() => {
    if (!assetManifest || !joinToken || (!userId && !loadOnly)) {
      return;
    }
    const access = { url: session.brokerUrl, token: joinToken };

    function retryLater(transfer: AssetTransfer) {
      transfer.failures += 1;
      const delay = Math.min(1000 * 2 ** transfer.failures, MAX_RETRY_DELAY);
      transfer.retryAt = Date.now() + delay;
      // Wait a little longer than needed to be sure the delay has passed
      const timeout = setTimeout(() => {
        retryTimeoutsRef.current.delete(timeout);
        setRetryCount((count) => count + 1);
      }, delay + 50);
      retryTimeoutsRef.current.add(timeout);
    }

    // Only show one toast for an asset that keeps failing
    function warnOnce(transfer: AssetTransfer, message: string) {
      if (!transfer.warned && !loadOnly) {
        transfer.warned = true;
        addToast(message);
      }
    }

    async function shareAsset(
      asset: AssetManifestAsset,
      transfer: AssetTransfer
    ) {
      try {
        if (!(await hasAsset(access, asset.id))) {
          const storedAsset = await getAsset(asset.id);
          if (!storedAsset) {
            retryLater(transfer);
            return;
          }
          if (!allowUploadsRef.current) {
            retryLater(transfer);
            return;
          }
          await uploadAsset(access, storedAsset);
        }
        transfer.done = true;
      } catch (error) {
        const status = getErrorStatus(error);
        if (status === 400 || status === 413) {
          // Trying again won't change the answer
          transfer.done = true;
          addToast(
            status === 413
              ? "Unable to share image with the party as it is too large for the server"
              : "Unable to share image with the party"
          );
          return;
        }
        // The token is replaced when we rejoin so no need to warn about it
        if (status !== 401) {
          warnOnce(transfer, "Unable to share image with the party, retrying");
        }
        retryLater(transfer);
      }
    }

    async function loadAsset(
      asset: AssetManifestAsset,
      transfer: AssetTransfer
    ) {
      try {
        const cachedAsset = await getAsset(asset.id);
        if (cachedAsset) {
          transfer.done = true;
          return;
        }
        assetLoadStart(asset.id);
        const loadedAsset = await downloadAsset(
          access,
          asset.id,
          (loaded, total) => {
            // Hold the last step back until the asset has been saved
            if (loaded < total) {
              assetProgressUpdate({ id: asset.id, count: loaded, total });
            }
          }
        );
        await putAsset(loadedAsset);
        assetProgressUpdate({ id: asset.id, count: 1, total: 1 });
        transfer.done = true;
      } catch (error) {
        const status = getErrorStatus(error);
        const isMissing = status === 404;
        const isOwnerInParty = Object.values(partyStateRef.current).some(
          (player) => player.userId === asset.owner
        );
        // An asset the server doesn't have yet is most likely still being sent
        // by its owner, so leave the loading bar up for the first few tries
        const isWaitingForOwner =
          isMissing && isOwnerInParty && transfer.failures < 4;
        if (!isWaitingForOwner) {
          assetLoadCancel(asset.id);
        }
        if (isMissing) {
          if (!isOwnerInParty) {
            warnOnce(transfer, "Unable to find owner for asset");
          }
        } else if (status !== 401) {
          warnOnce(transfer, "Unable to load image from the server, retrying");
        }
        retryLater(transfer);
      }
    }

    for (let asset of Object.values(assetManifest.assets)) {
      let transfer = assetTransfersRef.current[asset.id];
      if (!transfer) {
        transfer = {
          isBusy: false,
          done: false,
          failures: 0,
          retryAt: 0,
          warned: false,
        };
        assetTransfersRef.current[asset.id] = transfer;
      }
      if (transfer.isBusy || transfer.done || Date.now() < transfer.retryAt) {
        continue;
      }
      // Ensure transfers are marked before any async operation to prevent them from starting twice
      transfer.isBusy = true;
      const currentTransfer = transfer;
      const run = !loadOnly && asset.owner === userId ? shareAsset : loadAsset;
      run(asset, currentTransfer).finally(() => {
        currentTransfer.isBusy = false;
        if (currentTransfer.done) {
          currentTransfer.failures = 0;
          currentTransfer.warned = false;
        }
      });
    }
  }, [
    assetManifest,
    session,
    joinToken,
    retryCount,
    userId,
    loadOnly,
    allowUploads,
    addToast,
    getAsset,
    putAsset,
    assetLoadStart,
    assetProgressUpdate,
    assetLoadCancel,
  ]);
}

export default useAssetTransfers;
