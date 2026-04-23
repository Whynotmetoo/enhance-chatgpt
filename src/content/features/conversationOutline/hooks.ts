import { useEffect, useState } from "react";
import {
  recentConversationActivity,
  subscribeConversationActivity,
  type ConversationActivity
} from "../../lib/chatGptApiBridge";
import { debounce } from "../../lib/dom";
import { locationChangeSource } from "./constants";
import { conversationIdFromLocation, conversationIdFromUrl } from "./domOutline";
import type { ConversationLocation } from "./types";
import { isRecord } from "./utils";

const activityRouteSlackMs = 1_500;

type ConversationActivityObservation = {
  conversationId: string | null;
  changedAt: number;
  observed: boolean;
};

function isRightSidePanelElement(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
    if (current.closest(".ecg-outline")) {
      return false;
    }

    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);
    const isVisibleElement =
      style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
    const rightAligned = rect.left > window.innerWidth * 0.52 && rect.right > window.innerWidth - 96;
    const sidePanelSized =
      rect.width >= 280 && rect.width <= window.innerWidth * 0.52 && rect.height >= window.innerHeight * 0.45;

    if (isVisibleElement && rightAligned && sidePanelSized) {
      return true;
    }
  }

  return false;
}

function hasRightSidePanel(): boolean {
  const sampleX = window.innerWidth - 32;
  const sampleYs = [96, window.innerHeight * 0.5, window.innerHeight - 96].filter(
    (y) => y > 0 && y < window.innerHeight
  );

  return sampleYs.some((sampleY) =>
    document
      .elementsFromPoint(sampleX, sampleY)
      .some((element) => element instanceof HTMLElement && isRightSidePanelElement(element))
  );
}

export function useRightSidePanel(): boolean {
  const [isOpen, setIsOpen] = useState(() => hasRightSidePanel());

  useEffect(() => {
    const update = () => setIsOpen(hasRightSidePanel());
    const scheduleUpdate = debounce(update, 100);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return isOpen;
}

export function useConversationLocation(): ConversationLocation {
  const [location, setLocation] = useState<ConversationLocation>(() => ({
    conversationId: conversationIdFromLocation(),
    changedAt: Date.now() - 1_500
  }));

  useEffect(() => {
    const update = (changedAt = Date.now()) => {
      const conversationId = conversationIdFromLocation();
      setLocation((current) =>
        current.conversationId === conversationId
          ? current
          : {
              conversationId,
              changedAt
            }
      );
    };
    const handleLocationMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data)) {
        return;
      }

      if (event.data.source !== locationChangeSource) {
        return;
      }

      const href = typeof event.data.href === "string" ? event.data.href : window.location.href;
      const changedAt = typeof event.data.changedAt === "number" ? event.data.changedAt : Date.now();
      const conversationId = conversationIdFromUrl(href);
      setLocation((current) =>
        current.conversationId === conversationId
          ? current
          : {
              conversationId,
              changedAt
            }
      );
    };
    const updateFromWindow = () => update();
    const updateFromPoll = () => update(Date.now() - 250);
    const timer = window.setInterval(updateFromPoll, 250);

    window.addEventListener("message", handleLocationMessage);
    window.addEventListener("popstate", updateFromWindow);
    window.addEventListener("hashchange", updateFromWindow);
    update();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", handleLocationMessage);
      window.removeEventListener("popstate", updateFromWindow);
      window.removeEventListener("hashchange", updateFromWindow);
    };
  }, []);

  return location;
}

function activityConversationId(activity: ConversationActivity): string | null {
  return activity.conversationId ?? (activity.href ? conversationIdFromUrl(activity.href) : null);
}

function isRelevantConversationActivity(
  activity: ConversationActivity,
  conversationId: string,
  changedAt: number
): boolean {
  if (activity.changedAt < changedAt - activityRouteSlackMs) {
    return false;
  }

  const activityId = activityConversationId(activity);
  return activityId === conversationId || activityId === null;
}

export function useConversationStateActivity(conversationId: string | null, changedAt: number): boolean {
  const [observation, setObservation] = useState<ConversationActivityObservation>(() => ({
    conversationId,
    changedAt,
    observed: conversationId
      ? recentConversationActivity().some((activity) =>
          isRelevantConversationActivity(activity, conversationId, changedAt)
        )
      : false
  }));

  useEffect(() => {
    if (!conversationId) {
      setObservation({ conversationId: null, changedAt, observed: false });
      return;
    }

    const hasRecentActivity = () =>
      recentConversationActivity().some((activity) => isRelevantConversationActivity(activity, conversationId, changedAt));

    setObservation({ conversationId, changedAt, observed: hasRecentActivity() });

    return subscribeConversationActivity((activity) => {
      if (isRelevantConversationActivity(activity, conversationId, changedAt)) {
        setObservation({ conversationId, changedAt, observed: true });
      }
    });
  }, [conversationId, changedAt]);

  return (
    observation.conversationId === conversationId &&
    observation.changedAt === changedAt &&
    observation.observed
  );
}
