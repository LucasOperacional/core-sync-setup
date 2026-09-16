create policy "Members can delete private rooms"
on public.chat_rooms
for delete
to authenticated
using (type = 'private' and private.is_chat_room_member(id, auth.uid()));